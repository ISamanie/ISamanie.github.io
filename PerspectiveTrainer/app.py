import base64
import json
import os

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

# Import flask_cors with a fallback
try:
    from flask_cors import CORS
    _CORS_AVAILABLE = True
except ImportError:
    _CORS_AVAILABLE = False

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

load_dotenv()  # pulls OPENAI_API_KEY (and OPENAI_MODEL, if set) from .env

app = Flask(__name__)

# 1. DEFINE YOUR CLOUD FRONTEND URL
ALLOWED_ORIGIN = "https://isamanie.github.io"

# 2. RESTRICT CORS TO YOUR FRONTEND
if _CORS_AVAILABLE:
    CORS(app, origins=[ALLOWED_ORIGIN])

@app.after_request
def allow_frontend_requests(response):
    """Allow the cloud-hosted frontend to call the Flask API."""
    response.headers["Access-Control-Allow-Origin"] = ALLOWED_ORIGIN
    response.headers.setdefault("Access-Control-Allow-Headers", "Content-Type")
    response.headers.setdefault("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    return response

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

# The OpenAI SDK setup remains exactly the same
try:
    from openai import (
        APIConnectionError,
        APIStatusError,
        AuthenticationError,
        OpenAI,
        RateLimitError,
    )

    _client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None
    _OPENAI_SDK_AVAILABLE = True
except ImportError: 
    _client = None
    _OPENAI_SDK_AVAILABLE = False
    APIConnectionError = AuthenticationError = RateLimitError = APIStatusError = Exception


SYSTEM_PROMPT = (
    "You are an expert perspective-drawing instructor grading a student's attempt to "
    "complete a two-point perspective cube. The image you receive shows: a dashed "
    "horizon line, "
    "and one (occasionally two) complete face(s) of the cube already drawn for the "
    "student as a solid, lightly shaded quadrilateral plane. A few faint dashed hint "
    "lines toward the vanishing points may also be visible. The student's own "
    "hand-drawn lines attempt to complete the remaining visible face(s) of the cube — "
    "typically some combination of a vertical side edge and edges that should converge "
    "back toward a vanishing point, meeting the given plane's corners exactly.\n\n"
    "The accompanying JSON context tells you exactly which face(s) were given "
    "(givenFaces), which face(s) the student needed to complete (remainingFaces), and "
    "how many new edges were expected (expectedNewEdges) — use this to judge "
    "completeness as well as accuracy.\n\n"
    "Judge the drawing on: (1) whether the new lines actually converge toward the "
    "correct vanishing point rather than drifting off at the wrong angle, (2) whether "
    "they meet the given plane's corners rather than floating disconnected from it, "
    "(3) whether vertical edges are proportionate and truly vertical, and (4) whether "
    "the overall result reads as a plausible, fully-closed 3D cube rather than a flat "
    "or distorted shape.\n\n"
    "Respond with ONLY a raw JSON object, no markdown fences, no extra commentary, in "
    'exactly this shape: {"score": <integer 1-100>, "feedback": "<1-2 concise, '
    'specific, actionable sentences>"}. 100 means the cube is essentially perfect; '
    "1 means the attempt bears no relation to a converging, closed cube."
)


# ---------------------------------------------------------------------------
# Routes (Remain exactly the same)
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/evaluate", methods=["POST"])
def evaluate():
    """Accepts { image: <data URL>, context: {...} } and returns
    { score: int, feedback: str } or { error: str } with an appropriate
    HTTP status code on failure.
    """

    if not OPENAI_API_KEY:
        return (
            jsonify(
                {
                    "error": (
                        "OPENAI_API_KEY is not configured on the server. "
                        "Add it to your environment variables and restart the app."
                    )
                }
            ),
            500,
        )

    if not _OPENAI_SDK_AVAILABLE:
        return (
            jsonify({"error": "The 'openai' package is not installed on the server."}),
            500,
        )

    # ---- Parse & validate the request body --------------------------------
    try:
        payload = request.get_json(force=True, silent=False)
    except Exception:
        return jsonify({"error": "Request body must be valid JSON."}), 400

    if not payload or "image" not in payload:
        return jsonify({"error": "Missing required 'image' field."}), 400

    image_data_url = payload.get("image", "")
    context = payload.get("context", {})

    if not isinstance(image_data_url, str) or not image_data_url.startswith("data:image"):
        return (
            jsonify({"error": "Field 'image' must be a base64 data URL (e.g. 'data:image/png;base64,...')."}),
            400,
        )

    try:
        _, b64_part = image_data_url.split(",", 1)
        base64.b64decode(b64_part, validate=True)
    except Exception:
        return jsonify({"error": "Image data is not valid base64-encoded PNG data."}), 400

    user_text = (
        f"Scene context (pixel coordinates, canvas {context.get('canvasWidth', '?')}x"
        f"{context.get('canvasHeight', '?')}): {json.dumps(context)}\n\n"
        "Evaluate the student's completed cube drawing shown in the attached image "
        "and return the JSON verdict now."
    )

    # ---- Call OpenAI --------------------------------------------------------
    try:
        response = _client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_text},
                        {"type": "image_url", "image_url": {"url": image_data_url}},
                    ],
                },
            ],
            max_tokens=300,
            temperature=0.4,
            response_format={"type": "json_object"},
        )
    except AuthenticationError:
        return jsonify({"error": "OpenAI rejected the API key. Check OPENAI_API_KEY in your env config."}), 502
    except RateLimitError:
        return jsonify({"error": "OpenAI rate limit or quota exceeded. Please wait and try again."}), 502
    except APIConnectionError:
        return jsonify({"error": "Could not reach OpenAI's servers. Check your network connection."}), 502
    except APIStatusError as exc:
        return jsonify({"error": f"OpenAI API error (status {exc.status_code}): {exc.message}"}), 502
    except Exception as exc: 
        return jsonify({"error": f"Unexpected error contacting OpenAI: {exc}"}), 502

    # ---- Parse the model's response ----------------------------------------
    try:
        raw_content = response.choices[0].message.content
        result = json.loads(raw_content)
        score = int(result["score"])
        score = max(1, min(100, score))
        feedback = str(result.get("feedback", "")).strip() or "No feedback was provided."
    except (KeyError, ValueError, json.JSONDecodeError, IndexError, AttributeError):
        return (
            jsonify({"error": "The AI evaluator returned a response we couldn't parse. Please try again."}),
            502,
        )

    return jsonify({"score": score, "feedback": feedback})


if __name__ == "__main__":
    # 3. USE DYNAMIC PORT FOR CLOUD DEPLOYMENTS
    # Cloud providers inject the 'PORT' env variable. Fallback to 5000 for local testing.
    port = int(os.environ.get("PORT", 5000))
    
    # Disable debug mode for production deployments
    app.run(host="0.0.0.0", port=port, debug=False)