# Neuris Web

Neuris Web is a dependency-free, terminal-style interface for the experimental Neuris input classifier. It sends text to the shared Soyez Sécurisé API and displays the predicted class, confidence, and probability distribution.

> [!CAUTION]
> Neuris is a machine-learning experiment, not a web application firewall, malware detector, or production security control. A `SAFE` result does not prove that an input is safe.

## What Neuris classifies

The current backend model chooses one of five labels:

- `SAFE`
- `PATH_TRAVERSAL`
- `SQLI`
- `COMMAND_INJECTION`
- `XSS`

The model is a character-level NumPy classifier loaded by `../soyezsecurise-backend/neuris.py`. The portfolio's project notes document known class-level weaknesses and the need for testing on genuinely novel inputs.

## How it works

```text
user input
   │
   ▼
app.js URL-encodes the text
   │
   ▼
GET /neuris?string=...
   │
   ▼
backend normalization + NumPy model
   │
   ▼
label, confidence, all class probabilities
   │
   ▼
terminal-style result rendering
```

The frontend itself has no build step and no JavaScript dependencies. `index.html` defines the interface, `styles.css` provides the terminal presentation, and `app.js` handles commands, requests, and output rendering.

## API configuration

Set `NEURIS_SERVER_URL` near the top of `app.js`:

```js
const NEURIS_SERVER_URL = "http://127.0.0.1:8000";
```

When the frontend and API use different origins, the backend must permit the frontend origin through CORS.

The expected request is:

```text
GET /neuris?string=<url-encoded-input>
```

The response shape is:

```json
{
  "result": {
    "response": "SAFE",
    "confidence": 0.98,
    "probabilities": {
      "SAFE": 0.98,
      "PATH_TRAVERSAL": 0.001,
      "SQLI": 0.005,
      "COMMAND_INJECTION": 0.013,
      "XSS": 0.001
    }
  }
}
```

Values above illustrate the format only.

## Run locally

Start the backend on port 8000, update `NEURIS_SERVER_URL`, and serve this directory:

```bash
python3 -m http.server 8081
```

Open `http://127.0.0.1:8081`.

## Typeface

The interface uses the Delta typeface by Maryia Hilep. Its license is included at `DELTA/delta_font_by_maryia_hilep_licence.txt`.

## Limitations

- Model predictions can be wrong, especially on unfamiliar input distributions.
- Confidence is a model score, not proof of safety or malicious intent.
- Classification cannot replace input validation, output encoding, parameterized queries, least privilege, or sandboxing.
- The project does not currently include a comprehensive browser test suite.

## Related projects

- `../soyezsecurise-backend/` — API and bundled model
- `../soyezsecurise-frontend/` — portfolio and detailed project notes
