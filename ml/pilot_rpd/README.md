# Acrylic RPD pilot dataset — start here

Everything needed to collect and label the 50-case acrylic RPD pilot.
No coding is needed. **Nothing is trained in the pilot.**

| File | What it is | Who uses it |
|---|---|---|
| `ANNOTATION_PROTOCOL.md` | The rulebook: the 5 photos, what to label in each, how, and what counts as acceptable | Everyone: read it first |
| `case_register.xlsx` | Spreadsheet for RPD-001 … RPD-050: consent, photos, QC and instructor grades | Photographer, reviewer, instructor |
| `cvat_labels.json` | Label list to paste into CVAT once (protocol section 4) | Annotator |
| `cases/RPD-000_EXAMPLE/` | Example of the folder layout and file names | Copy it for each new case |
| `schema/rpd_case.schema.json` | Technical description of a finished case, for training later | Not needed during collection |
| `schema/example_case.json` | A sample case in that format (not a real patient) | Not needed during collection |
| `schema/build_case_register.py` | Regenerates a blank `case_register.xlsx` | Only if the blank register is lost |

## Folder layout for each case

```
cases/
  RPD-007/
    photos/
      RPD-007_1_maxillary_arch.jpg
      RPD-007_2_mandibular_arch.jpg
      RPD-007_3_anterior.jpg
      RPD-007_4_replacement_region.jpg
      RPD-007_5_replacement_occlusion.jpg
    annotations/
      (CVAT export zip)
```

Real case folders are **ignored by Git**, so patient photos are never
uploaded to this public repository. Store them on secure institutional
storage.
