import json
import os
from flask import Flask, jsonify, request
from flask_cors import CORS
from openai import OpenAI

app = Flask(__name__)
CORS(app)  # Enables cross-origin requests from frontend

client = OpenAI()  # Uses OPENAI_API_KEY environment variable
MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

SYSTEM = """You are a computer-architecture tutor embedded in a 4-way superscalar
out-of-order processor simulator. Design: fetch (4/cycle, predict not-taken), RRU
(speculative RAT, batch dependency bypass, stalls after a flush until the ROB drains,
then copies archRAT), PRF (per-preg FSM: available, renamed-not-valid, renamed-valid,
arch), 16-entry ROB (retires a contiguous prefix, flush marks younger entries squashed
and they drain in order), unified 8-entry issue queue (wakeup on execute broadcast),
4 execution lanes (ALU 1 cycle, MUL 3 cycles). Answer questions about the features,
offer alternative designs and explain why the current one may have been chosen.
Be concise and concrete."""


@app.get("/")
def health_check():
    return jsonify(status="ok", message="OoO Simulator Backend Running")


@app.post("/chat")
def chat():
    d = request.get_json(force=True) or {}
    
    file_name = d.get("file", "top.sv")
    assembly_code = d.get("assembly", "No assembly provided")
    state_info = d.get("state", {})
    user_msg = d.get("message", "")

    # Format assembly and execution context for GPT
    ctx = (
        f"Active File: {file_name}\n"
        f"--- Assembly Code Being Executed ---\n{assembly_code}\n"
        f"--- Current CPU State ---\n{json.dumps(state_info, indent=2)}"
    )

    try:
        r = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": SYSTEM + "\n\n" + ctx},
                {"role": "user", "content": user_msg},
            ],
        )
        return jsonify(reply=r.choices[0].message.content)
    except Exception as e:
        return jsonify(error=str(e)), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)