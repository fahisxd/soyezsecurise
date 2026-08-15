# Neuris Ultemate

A dependency-free terminal-style web client for the `neuris-cli` input classifier.

The interface uses the Delta typeface by Maryia Hilep. Its license is included in `DELTA/delta_font_by_maryia_hilep_licence.txt`.

## Run it

Serve this directory with any static web server. The client calls the same origin by default:

```text
GET /neuris?string=<url-encoded-input>
```

To use a separate API host, set `NEURIS_SERVER_URL` near the top of `app.js`:

```js
const NEURIS_SERVER_URL = "https://api.example.com";
```

The API must permit the frontend origin through CORS when the two are hosted on different origins.

## Expected response

```json
{
  "result": {
    "response": "SAFE",
    "confidence": 0.9804502041808368,
    "probabilities": {
      "SAFE": 0.9804502041808368,
      "PATH_TRAVERSAL": 3.2075865992805496e-7,
      "SQLI": 0.0006907633066955783,
      "COMMAND_INJECTION": 0.01885863747316508,
      "XSS": 7.42806426208893e-8
    }
  }
}
```
