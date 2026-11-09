"""Builds ../case_register.xlsx, the no-code register for the 50-case pilot.

Run:  python3 build_case_register.py
Re-running overwrites the register, so only do it before data entry starts.
"""
from pathlib import Path

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

OUT = Path(__file__).resolve().parent.parent / "case_register.xlsx"
N_CASES = 50
FONT = "Arial"

VIEWS = ["1 Maxillary arch", "2 Mandibular arch", "3 Anterior view",
         "4 Replacement region", "5 Replacement in occlusion"]
GRADES = ["Acceptable", "Minor deviation", "Significant deviation", "Cannot assess"]
PARAMS = ["Space fit", "Arch alignment", "Ridge relation", "Long-axis inclination",
          "Occlusal plane level", "Occlusal contact", "Midline & symmetry"]
FDI = [str(q * 10 + t) for q in (1, 2, 3, 4) for t in range(1, 9)]

INPUT = PatternFill("solid", fgColor="FFF2CC")    # yellow: you type here
AUTO = PatternFill("solid", fgColor="E2EFDA")     # green: filled automatically
EXAMPLE = PatternFill("solid", fgColor="EDEDED")  # grey: example row
HEAD = PatternFill("solid", fgColor="1F4E78")
THIN = Side(style="thin", color="BFBFBF")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)


def base_font(size=10, **kw):
    return Font(name=FONT, size=size, **kw)


def header(ws, names, widths):
    for i, (n, w) in enumerate(zip(names, widths), 1):
        c = ws.cell(row=1, column=i, value=n)
        c.font = Font(name=FONT, size=10, bold=True, color="FFFFFF")
        c.fill = HEAD
        c.alignment = Alignment(wrap_text=True, vertical="center")
        c.border = BOX
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.row_dimensions[1].height = 45
    ws.freeze_panes = "B2"


def style_row(ws, r, ncols, auto_cols, example=False):
    for c in range(1, ncols + 1):
        cell = ws.cell(row=r, column=c)
        cell.font = base_font(italic=example)
        cell.border = BOX
        if example:
            cell.fill = EXAMPLE
        elif get_column_letter(c) in auto_cols:
            cell.fill = AUTO
        elif c > 1:
            cell.fill = INPUT


def dropdown(ws, source, cells):
    dv = DataValidation(type="list", formula1=source, allow_blank=True,
                        showErrorMessage=True, errorTitle="Choose from the list",
                        error="Please pick a value from the drop-down list.")
    ws.add_data_validation(dv)
    dv.add(cells)


wb = Workbook()

# ---------------------------------------------------------------- How to use
ws = wb.active
ws.title = "How to use"
ws.column_dimensions["A"].width = 4
ws.column_dimensions["B"].width = 100
lines = [
    ("Acrylic RPD pilot — case register (protocol v1.0)", True),
    ("", False),
    ("Colour key", True),
    ("Yellow cells: you type or choose from the drop-down.", False),
    ("Green cells: filled automatically — do not type in them.", False),
    ("Grey rows: worked example (RPD-000), not a real patient.", False),
    ("", False),
    ("Steps for each new case", True),
    ("1. Take the next free row (RPD-001 … RPD-050) in 'Case register'.", False),
    ("2. Record consent first. No consent = no photos.", False),
    ("3. Fill arch, Kennedy class, replaced teeth and setting.", False),
    ("4. Take and rename the 5 photos (protocol section 3); mark each photo column Yes.", False),
    ("5. 'Photos' and 'Ready' fill in automatically.", False),
    ("6. Label the photos in CVAT and mark 'Annotated' Yes.", False),
    ("7. The reviewer fills the 5 rows for the case in 'Annotation QC'.", False),
    ("8. The instructor grades each replacement tooth in 'Replacement-tooth assessment'.", False),
    ("", False),
    ("Privacy", True),
    ("Never enter names, hospital numbers, dates of birth or contact details anywhere in this file.", False),
    ("Use initials or codes (e.g. RV1, IN1) for reviewers and instructors.", False),
    ("Keep real photos on secure institutional storage, not in the public GitHub repository.", False),
]
for i, (t, bold) in enumerate(lines, 1):
    c = ws.cell(row=i, column=2, value=t)
    c.font = base_font(bold=bold, size=12 if i == 1 else 10)
for row, fill in ((4, INPUT), (5, AUTO), (6, EXAMPLE)):
    ws.cell(row=row, column=1).fill = fill

# ----------------------------------------------------------------- Lists
lists = wb.create_sheet("Lists")
cols = {
    "A": ("YesNo", ["Yes", "No"]),
    "B": ("Arch", ["Maxillary", "Mandibular"]),
    "C": ("Kennedy", ["I", "II", "III", "IV"]),
    "D": ("Setting", ["Cast", "Intraoral"]),
    "E": ("Grade", GRADES),
    "F": ("View", VIEWS),
    "G": ("FDI", FDI),
    "H": ("Quality", ["Good", "Usable", "Retake"]),
}
src = {}
for col, (name, vals) in cols.items():
    lists[f"{col}1"] = name
    lists[f"{col}1"].font = base_font(bold=True)
    for i, v in enumerate(vals, 2):
        lists[f"{col}{i}"] = v
        lists[f"{col}{i}"].font = base_font()
    src[name] = f"Lists!${col}$2:${col}${len(vals) + 1}"
lists.sheet_state = "hidden"

# ------------------------------------------------------------- Case register
reg = wb.create_sheet("Case register", 1)
names = ["Case ID", "Consent recorded", "Arch", "Kennedy class", "Modifications",
         "Replaced teeth (FDI, e.g. 14,15)", "Setting", "Ruler in photos",
         "Mirror used (occlusal)", "Double-annotation case", "Date taken (month/year only)",
         "Photo 1 Maxillary arch", "Photo 2 Mandibular arch", "Photo 3 Anterior",
         "Photo 4 Replacement region", "Photo 5 Replacement occlusion",
         "Worst photo quality", "Annotated in CVAT", "Exported to annotations/",
         "Photos", "Ready", "QC accepted (all 5)", "Graded by instructor",
         "Annotator ID", "Reviewer ID", "Instructor ID", "Notes (no identifiers)"]
header(reg, names, [10, 10, 12, 9, 9, 16, 10, 9, 10, 11, 12] + [11] * 5 + [10, 10, 11, 8, 8, 10, 10, 10, 10, 10, 36])
reg["T1"].comment = Comment("Counts photo columns marked Yes.", "register")
reg["U1"].comment = Comment("Yes when consent is Yes and all 5 photos are in.", "register")
reg["V1"].comment = Comment("Yes when all 5 photos of this case are Accepted in 'Annotation QC'.", "register")

AUTO_REG = {"T", "U", "V"}
example = ["RPD-000 (EXAMPLE)", "Yes", "Maxillary", "III", 0, "14,15", "Cast", "Yes", "Yes", "No",
           "01/2026", "Yes", "Yes", "Yes", "Yes", "Yes", "Good", "Yes", "Yes", None, None, None,
           "Yes", "AN1", "RV1", "IN1", "Example only — not a real patient"]
last = N_CASES + 2
for r in range(2, last + 1):
    if r == 2:
        for c, v in enumerate(example, 1):
            reg.cell(row=r, column=c, value=v)
        case = "RPD-000 (EXAMPLE)"
    else:
        case = f"RPD-{r - 2:03d}"
        reg.cell(row=r, column=1, value=case)
        if (r - 2) % 5 == 0:
            reg.cell(row=r, column=10, value="Yes")
    reg[f"T{r}"] = f'=COUNTIF(L{r}:P{r},"Yes")&"/5"'
    reg[f"U{r}"] = f'=IF(AND(B{r}="Yes",COUNTIF(L{r}:P{r},"Yes")=5),"Yes","No")'
    reg[f"V{r}"] = f"=IF(COUNTIFS('Annotation QC'!$A:$A,A{r},'Annotation QC'!$K:$K,\"Yes\")=5,\"Yes\",\"No\")"
    style_row(reg, r, len(names), AUTO_REG, example=(r == 2))
rng = lambda col: f"{col}2:{col}{last}"
for col in ["B", "H", "I", "J", "L", "M", "N", "O", "P", "R", "S", "W"]:
    dropdown(reg, src["YesNo"], rng(col))
dropdown(reg, src["Arch"], rng("C"))
dropdown(reg, src["Kennedy"], rng("D"))
dropdown(reg, src["Setting"], rng("G"))
dropdown(reg, src["Quality"], rng("Q"))
mods = DataValidation(type="whole", operator="between", formula1="0", formula2="4", allow_blank=True)
reg.add_data_validation(mods)
mods.add(rng("E"))

# ------------------------------------------------ Replacement-tooth assessment
asm = wb.create_sheet("Replacement-tooth assessment", 2)
names = (["Case ID", "Replacement tooth (FDI)"] + PARAMS
         + ["Gap/overlap (mm)", "Arch offset (mm)", "Ridge offset (mm)",
            "Inclination diff (°)", "Plane step (mm)", "Midline offset (mm)",
            "Instructor ID", "Notes"])
header(asm, names, [18, 11] + [14] * 7 + [11] * 6 + [10, 30])
examples = [
    ["RPD-000 (EXAMPLE)", "14", "Acceptable", "Minor deviation", "Acceptable", "Acceptable",
     "Acceptable", "Acceptable", "Cannot assess", 0.3, 1.4, 0.8, 3, 0.2, None, "IN1", "Example"],
    ["RPD-000 (EXAMPLE)", "15", "Minor deviation", "Acceptable", "Acceptable", "Minor deviation",
     "Acceptable", "Minor deviation", "Cannot assess", 0.8, 0.6, 0.5, 7, 0.4, None, "IN1", "Example"],
]
alast = 2 + len(examples) + 200
for r in range(2, alast + 1):
    if r - 2 < len(examples):
        for c, v in enumerate(examples[r - 2], 1):
            asm.cell(row=r, column=c, value=v)
    style_row(asm, r, len(names), set(), example=(r - 2 < len(examples)))
dropdown(asm, src["FDI"], f"B2:B{alast}")
dropdown(asm, src["Grade"], f"C2:I{alast}")
num = DataValidation(type="decimal", operator="between", formula1="-90", formula2="90", allow_blank=True)
asm.add_data_validation(num)
num.add(f"J2:O{alast}")

# ------------------------------------------------------------- Annotation QC
qc = wb.create_sheet("Annotation QC", 3)
names = ["Case ID", "View", "Required labels complete",
         "Not visible (list labels, e.g. INCISIVE_PAPILLA)", "Tooth numbers (FDI) checked",
         "Boxes tight & oriented (protocol §5)", "Points within ~0.5 mm",
         "Midline/ruler points in stated order", "Reference uncertain",
         "Original photo, only renamed", "Accepted", "Reviewer ID", "Notes"]
header(qc, names, [18, 22, 11, 26, 11, 13, 11, 13, 10, 11, 9, 10, 30])
qc["K1"].comment = Comment("Yes when every check (C, E, F, G, H, J) is Yes; blank until checks start.", "register")
cases = ["RPD-000 (EXAMPLE)"] + [f"RPD-{i:03d}" for i in range(1, N_CASES + 1)]
r = 2
for case in cases:
    for v in VIEWS:
        qc.cell(row=r, column=1, value=case)
        qc.cell(row=r, column=2, value=v)
        if case.endswith("(EXAMPLE)"):
            for col, val in zip("CDEFGHIJL", ["Yes", "INCISIVE_PAPILLA" if v.startswith("1") else "",
                                               "Yes", "Yes", "Yes", "Yes", "No", "Yes", "RV1"]):
                qc[f"{col}{r}"] = val or None
        qc[f"K{r}"] = (f'=IF(LEN(C{r}&E{r}&F{r}&G{r}&H{r}&J{r})=0,"",'
                       f'IF(AND(C{r}="Yes",E{r}="Yes",F{r}="Yes",G{r}="Yes",H{r}="Yes",J{r}="Yes"),"Yes","No"))')
        style_row(qc, r, len(names), {"A", "B", "K"}, example=case.endswith("(EXAMPLE)"))
        r += 1
qlast = r - 1
for col in "CEFGHIJ":
    dropdown(qc, src["YesNo"], f"{col}2:{col}{qlast}")

for sheet in (reg, asm, qc):
    sheet.auto_filter.ref = f"A1:{get_column_letter(sheet.max_column)}{sheet.max_row}"

wb.calculation.fullCalcOnLoad = True
wb.save(OUT)
print("saved", OUT)
