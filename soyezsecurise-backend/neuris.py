from pathlib import Path
import json
import numpy as np


_MODEL_DIR = Path(__file__).resolve().parent / "model"
_LABELS = (
    "SAFE",
    "PATH_TRAVERSAL",
    "SQLI",
    "COMMAND_INJECTION",
    "XSS",
)
_MAX_SEQUENCE_LENGTH = 128
_HEAD_LENGTH = 96

with (_MODEL_DIR / "vocab.json").open(encoding="utf-8") as _file:
    _VOCAB = json.load(_file)

with np.load(_MODEL_DIR / "model.npz", allow_pickle=False) as _model:
    _TOKENS = np.asarray(_model["tokens"], dtype=np.float64)
    _POSITIONS = np.asarray(_model["positions"], dtype=np.float64)
    _WQ = np.asarray(_model["attention_Wq"], dtype=np.float64)
    _WK = np.asarray(_model["attention_Wk"], dtype=np.float64)
    _WV = np.asarray(_model["attention_Wv"], dtype=np.float64)
    _FF_HIDDEN_WEIGHTS = np.asarray(
        _model["ff_hidden_weights"], dtype=np.float64
    )
    _FF_HIDDEN_BIASES = np.asarray(
        _model["ff_hidden_biases"], dtype=np.float64
    )
    _FF_OUTPUT_WEIGHTS = np.asarray(
        _model["ff_output_weights"], dtype=np.float64
    )
    _FF_OUTPUT_BIASES = np.asarray(
        _model["ff_output_biases"], dtype=np.float64
    )
    _CLASSIFIER_WEIGHTS = np.asarray(
        _model["classifier_weights"], dtype=np.float64
    )
    _CLASSIFIER_BIASES = np.asarray(
        _model["classifier_biases"], dtype=np.float64
    )
    _POOLING_QUERY = np.asarray(_model["pooling_query"], dtype=np.float64)


def neuris(raw_input: str) -> dict:
    """Classify text and return Neuris's response, confidence, and all scores."""
    if not isinstance(raw_input, str):
        raise TypeError("Input must be a string")
    if not raw_input:
        raise ValueError("Input cannot be empty")

    if len(raw_input) <= _MAX_SEQUENCE_LENGTH:
        selected_input = raw_input
    else:
        tail_length = _MAX_SEQUENCE_LENGTH - _HEAD_LENGTH
        selected_input = raw_input[:_HEAD_LENGTH] + raw_input[-tail_length:]

    token_ids = np.fromiter(
        (_VOCAB.get(character, _VOCAB["<UNK>"]) for character in selected_input),
        dtype=np.intp,
        count=len(selected_input),
    )
    tokens = _TOKENS[token_ids] + _POSITIONS[: len(token_ids)]

    queries = tokens @ _WQ
    keys = tokens @ _WK
    values = tokens @ _WV
    attention_scores = (queries @ keys.T) / np.sqrt(float(_WQ.shape[0]))
    attention_scores -= np.max(attention_scores, axis=-1, keepdims=True)
    attention_weights = np.exp(attention_scores)
    attention_weights /= attention_weights.sum(axis=-1, keepdims=True)

    first_residual = attention_weights @ values + tokens
    first_means = first_residual.mean(axis=1, keepdims=True)
    first_variances = first_residual.var(axis=1, keepdims=True)
    first_normalized = (first_residual - first_means) / np.sqrt(
        first_variances + 1e-5
    )

    hidden = np.maximum(
        0.0,
        first_normalized @ _FF_HIDDEN_WEIGHTS.T + _FF_HIDDEN_BIASES,
    )
    feedforward_output = hidden @ _FF_OUTPUT_WEIGHTS.T + _FF_OUTPUT_BIASES
    second_residual = feedforward_output + first_normalized
    second_means = second_residual.mean(axis=1, keepdims=True)
    second_variances = second_residual.var(axis=1, keepdims=True)
    encoded = (second_residual - second_means) / np.sqrt(
        second_variances + 1e-5
    )

    pooling_scores = encoded @ _POOLING_QUERY / np.sqrt(
        float(_POOLING_QUERY.size)
    )
    pooling_scores -= np.max(pooling_scores)
    pooling_weights = np.exp(pooling_scores)
    pooling_weights /= pooling_weights.sum()
    pooled = pooling_weights @ encoded

    logits = _CLASSIFIER_WEIGHTS @ pooled + _CLASSIFIER_BIASES
    scores = np.exp(logits - np.max(logits))
    scores /= scores.sum()
    best_index = int(np.argmax(scores))
    probabilities = {
        label: float(score) for label, score in zip(_LABELS, scores)
    }

    return {
        "response": _LABELS[best_index],
        "confidence": probabilities[_LABELS[best_index]],
        "probabilities": probabilities,
    }
