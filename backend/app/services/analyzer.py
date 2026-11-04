"""Compact rule-based transcript classifier (stdlib only, offline).

Distilled from the old model/transcript_analyzer.py lexicon: English + Hindi
(Roman & Devanagari) + Marathi cues. Opt-out always wins. Only the customer's
own words are scored when the transcript is speaker-labelled.
"""
import re

# (pattern, weight, label)
_POSITIVE = [
    (r"\bi am interested\b|\bi'?m interested\b|\binterested hai\b|\binterest hai\b", 5, "explicit interest"),
    (r"इंटरेस्टेड|मुझे चाहिए|चाहिए मुझे|बताइए|पाहिजे|सांगा", 4, "explicit interest"),
    (r"\bprice\b|\bcost\b|\brate kitna\b|\bkitne ka\b|\bhow much\b|कितना|कितने|किंमत", 3, "asked price/details"),
    (r"\bdemo\b|\bbook\b.*\b(demo|visit|meeting)\b|\bsite visit\b", 4, "wants a demo/visit"),
    (r"\bsend\b.*\b(details|brochure|link|info)\b|भेज दीजिए|भेजा", 3, "asked for details"),
    (r"\bsounds good\b|\btheek hai\b|\bthik hai\b|\bachha hai\b|ठीक है|बरं|चालेल", 3, "positive response"),
    (r"\bi (need|want)\b|\bmujhe chahiye\b|जरूर|नक्की", 3, "expressed a need"),
    (r"\bhow (do|can) i (start|join|buy|get)\b|\bnext step\b|\bsign up\b|\bgo ahead\b", 4, "ready for next step"),
    (r"\btell me more\b|\baur batao\b|\bdetail mein\b", 2, "wants more information"),
]
_NEGATIVE = [
    (r"\bnot interested\b|\bno interest\b|नॉट इंटरेस्टेड|इंटरेस्ट नहीं|रुचि नहीं", 6, "explicitly not interested"),
    (r"\bnahi chahiye\b|\bnai chahiye\b|\bnahi lena\b|नहीं चाहिए|नको|नाही पाहिजे", 5, "refused the offer"),
    (r"\bno need\b|\bdon'?t need\b|\bno requirement\b|\bzarurat nahi\b|गरज नाही", 4, "no need"),
    (r"\balready (have|using|taken|bought)\b|पहले से है|आधीच आहे", 4, "already has an alternative"),
    (r"\btoo (expensive|costly|high)\b|\bmehenga\b|महंगा|महाग", 3, "price objection"),
    (r"\bwrong number\b|\bgalat number\b|चुकीचा नंबर", 6, "wrong number"),
    (r"\bscam\b|\bfraud\b|\bfake (call|company)\b|धोखा|फ्रॉड", 4, "trust concern"),
    (r"\bphone rakho\b|रख दो|\bcut the call\b", 4, "asked to hang up"),
]
_OPT_OUT = re.compile(
    r"\bdo ?n'?t call\b|\bdo not call\b|\bstop calling\b|\bremove my number\b|"
    r"\bnumber (delete|remove)\b|फोन मत करो|कॉल मत करो|परत फोन करू नका|\bdnc\b",
    re.IGNORECASE,
)
_CALLBACK = re.compile(
    r"\bcall (me )?(later|back|tomorrow|after)\b|\bcallback\b|"
    r"\bbaad mein (call|baat)\b|\bkal (call|baat|phone)\b|नंतर कॉल|नंतर बोला|"
    r"\bi'?ll (think|decide) and tell\b|\bsoch ke bata\b|\bthink about it\b|"
    r"\bbusy\b|\btime nahi\b|वेळ नाही",
    re.IGNORECASE,
)
_CUSTOMER_LINE = re.compile(r"^\s*(customer|user|caller|client)\s*[:\-]\s*(.*)$", re.IGNORECASE)


def _customer_text(transcript: str) -> str:
    labelled = []
    for line in (transcript or "").splitlines():
        m = _CUSTOMER_LINE.match(line)
        if m:
            labelled.append(m.group(2))
    return "\n".join(labelled) if labelled else (transcript or "")


def _score(text: str, cues) -> tuple[int, list[str]]:
    total, labels = 0, []
    for pattern, weight, label in cues:
        if re.search(pattern, text, re.IGNORECASE):
            total += weight
            labels.append(label)
    return total, labels


def analyze(transcript_text: str) -> dict:
    """Return {disposition, lead_score, summary, opt_out, callback_requested}."""
    text = _customer_text(transcript_text or "")
    low = text.lower()

    opt_out = bool(_OPT_OUT.search(low))
    if opt_out:
        return {
            "disposition": "not_interested",
            "lead_score": 0,
            "summary": "Customer explicitly asked not to be called again (opt-out).",
            "opt_out": True,
            "callback_requested": False,
        }

    pos, pos_labels = _score(low, _POSITIVE)
    neg, neg_labels = _score(low, _NEGATIVE)
    callback = bool(_CALLBACK.search(low))

    if callback and neg < 6:
        return {
            "disposition": "callback_requested",
            "lead_score": 60,
            "summary": "Customer asked to be called back later.",
            "opt_out": False,
            "callback_requested": True,
        }
    if neg >= 4 and neg > pos:
        return {
            "disposition": "not_interested",
            "lead_score": max(5, 35 - neg),
            "summary": "Customer declined: " + ", ".join(neg_labels[:2]) + ".",
            "opt_out": False,
            "callback_requested": False,
        }
    if pos >= 3 and pos > neg:
        return {
            "disposition": "interested",
            "lead_score": min(95, 55 + pos * 5),
            "summary": "Customer showed interest: " + ", ".join(pos_labels[:2]) + ".",
            "opt_out": False,
            "callback_requested": False,
        }
    return {
        "disposition": "unknown",
        "lead_score": 40,
        "summary": "No clear interest signal in the customer's words.",
        "opt_out": False,
        "callback_requested": callback,
    }
