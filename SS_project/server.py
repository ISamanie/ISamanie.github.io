"""Chat backend for the OoO simulator.

Setup:  pip install flask flask-cors openai
        set OPENAI_API_KEY=sk-...        (PowerShell: $env:OPENAI_API_KEY="sk-...")
Run:    python server.py   then open index.html in a browser.
"""
import json, os
from flask import Flask, jsonify, request
from flask_cors import CORS
from openai import OpenAI

app = Flask(__name__)
CORS(app)
client = OpenAI()  # reads OPENAI_API_KEY
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


@app.post("/chat")
def chat():
    d = request.get_json(force=True)
    ctx = f"Selected file: {d.get('file')}\nNotes: {d.get('notes')}\nLive state: {json.dumps(d.get('state'))}"
    try:
        r = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": SYSTEM + "\n\n" + ctx},
                {"role": "user", "content": d.get("message", "")},
            ],
        )
        return jsonify(reply=r.choices[0].message.content)
    except Exception as e:
        return jsonify(error=str(e)), 500


if __name__ == "__main__":
    app.run(port=5000)
