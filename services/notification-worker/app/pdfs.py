"""Itinerary and invoice PDFs, built with ReportLab."""
from datetime import datetime
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

NAVY = colors.HexColor("#14284B")
SAND = colors.HexColor("#F3E9D8")
AGENCY = "Horizon Travel Services  |  12 Main Street, Andover, MA 01810  |  bookings@horizontravel.example"
TYPE_LABEL = {"flight": "Flight", "accommodation": "Stay", "activity": "Activity"}


def _money(cents: int, currency: str) -> str:
    return f"{currency} {cents / 100:,.2f}"


def _when(iso: str | None) -> str:
    if not iso:
        return ""
    return datetime.fromisoformat(iso).strftime("%a %d %b %Y, %H:%M UTC")


def _styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("t", parent=base["Title"], textColor=NAVY, alignment=0, fontSize=20, spaceAfter=4),
        "sub": ParagraphStyle("s", parent=base["Normal"], textColor=colors.HexColor("#5B6474"), fontSize=9),
        "h": ParagraphStyle("h", parent=base["Heading3"], textColor=NAVY, spaceBefore=10),
        "cell": ParagraphStyle("c", parent=base["Normal"], fontSize=9, leading=12),
    }


def _table(rows, widths, money_col: int | None = None) -> Table:
    t = Table(rows, colWidths=widths, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, SAND]),
        ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor("#D9DDE5")), ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]
    if money_col is not None:
        style.append(("ALIGN", (money_col, 0), (money_col, -1), "RIGHT"))
    t.setStyle(TableStyle(style))
    return t


def _doc(buf: BytesIO, title: str) -> SimpleDocTemplate:
    return SimpleDocTemplate(buf, pagesize=letter, title=title, author="Horizon Travel Services",
                             leftMargin=0.7 * inch, rightMargin=0.7 * inch, topMargin=0.7 * inch, bottomMargin=0.7 * inch)


def itinerary_pdf(b: dict) -> bytes:
    st, buf = _styles(), BytesIO()
    lead = b["leadTraveller"]
    story = [
        Paragraph("Your itinerary", st["title"]),
        Paragraph(AGENCY, st["sub"]), Spacer(1, 12),
        Paragraph(f"<b>Booking reference:</b> {b['reference']}", st["cell"]),
        Paragraph(f"<b>Lead traveller:</b> {lead['firstName']} {lead['lastName']}  ({lead['email']}, {lead['phone']})", st["cell"]),
        Paragraph("Trip", st["h"]),
    ]
    rows = [["Type", "Details", "Starts", "Ends"]]
    for item in b["items"]:
        d = item.get("details", {})
        extra = ""
        if item["type"] == "flight":
            extra = f"<br/>{d.get('stops', 0)} stop(s), {d.get('cabin', '')}, {d.get('passengers', 1)} passenger(s)"
        elif item["type"] == "accommodation":
            extra = f"<br/>{d.get('roomType', '')}, {d.get('guests', '')} guest(s), {d.get('neighbourhood', '')}"
        elif item["type"] == "activity":
            extra = f"<br/>{d.get('category', '')}, {d.get('durationMinutes', '')} minutes"
        rows.append([TYPE_LABEL[item["type"]], Paragraph(item["title"] + extra, st["cell"]),
                     Paragraph(_when(item.get("startAt")), st["cell"]), Paragraph(_when(item.get("endAt")), st["cell"])])
    story += [_table(rows, [0.8 * inch, 3.3 * inch, 1.5 * inch, 1.5 * inch]), Spacer(1, 16),
              Paragraph("Check in online with each airline 24 hours before departure. Bring the passport used for this booking. "
                        "Need to change something? Reply to your confirmation email or call the agency.", st["sub"])]
    _doc(buf, f"Itinerary {b['reference']}").build(story)
    return buf.getvalue()


def invoice_pdf(b: dict, issued: datetime) -> bytes:
    st, buf = _styles(), BytesIO()
    lead = b["leadTraveller"]
    story = [
        Paragraph("Invoice", st["title"]), Paragraph(AGENCY, st["sub"]), Spacer(1, 12),
        Paragraph(f"<b>Invoice number:</b> INV-{b['reference'][3:]}   <b>Issued:</b> {issued.strftime('%d %b %Y')}", st["cell"]),
        Paragraph(f"<b>Billed to:</b> {lead['firstName']} {lead['lastName']}, {lead['email']}", st["cell"]),
        Paragraph(f"<b>Booking reference:</b> {b['reference']}", st["cell"]), Spacer(1, 10),
    ]
    rows = [["Item", "Amount"]]
    for item in b["items"]:
        rows.append([Paragraph(f"{TYPE_LABEL[item['type']]}: {item['title']}", st["cell"]), _money(item["priceCents"], b["currency"])])
    rows.append([Paragraph("<b>Total paid</b>", st["cell"]), _money(b["totalCents"], b["currency"])])
    story += [_table(rows, [5.4 * inch, 1.7 * inch], money_col=1), Spacer(1, 12),
              Paragraph("Paid by card through Stripe. Card details are handled by Stripe and are never stored by Horizon Travel.", st["sub"])]
    _doc(buf, f"Invoice {b['reference']}").build(story)
    return buf.getvalue()
