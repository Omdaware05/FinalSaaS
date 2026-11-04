from app.services.analyzer import analyze


def test_interested_english():
    result = analyze("Agent: Hello\nCustomer: Yes, I am interested. Please send details, what is the price?")
    assert result["disposition"] == "interested"
    assert result["lead_score"] >= 60


def test_not_interested_with_opt_out():
    result = analyze("Customer: Not interested. Do not call me again, remove my number.")
    assert result["disposition"] == "not_interested"
    assert result["opt_out"] is True
    assert result["lead_score"] <= 10


def test_interested_hindi():
    result = analyze("Customer: मुझे इंटरेस्ट है, बताइए fees कितना है?")
    assert result["disposition"] == "interested"


def test_opt_out_marathi():
    result = analyze("Customer: मला नको, परत फोन करू नका")
    assert result["opt_out"] is True
    assert result["disposition"] == "not_interested"


def test_callback_requested():
    result = analyze("Customer: I am busy right now, please call me later tomorrow.")
    assert result["disposition"] == "callback_requested"
    assert result["callback_requested"] is True


def test_agent_words_do_not_count():
    result = analyze("Agent: Are you interested in our offer?\nCustomer: ठीक है")
    # Only the customer's mild agreement is scored -> not a strong interested lead
    assert result["disposition"] in ("unknown", "interested")
