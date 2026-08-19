# Tables as people actually write them

Nobody lines their pipes up by hand. Every shape below is legal GFM, and every
one of them must come back out of the editor byte for byte.

A tidy one, because those exist too:

| Name  | Role      | Since |
| ----- | --------- | ----- |
| Ann   | Reviewer  | 2019  |
| Bo    | Author    | 2021  |

The same table after someone edited one cell:

| Name  | Role      | Since |
| ----- | --------- | ----- |
| Ann   | Reviewer was changed here | 2019  |
| Bo    | Author    | 2021  |

No outer pipes at all:

Name | Role | Since
--- | --- | ---
Ann | Reviewer | 2019
Bo | Author | 2021

Leading pipe only:

| Name | Role
| --- | ---
| Ann | Reviewer

Ragged spacing, mixed alignment markers, and a short row:

|Name|   Role  |Since|
|:---|:-------:|----:|
|Ann|Reviewer|2019|
| Bo |    Author |
|Cy|`code | with a pipe`|2024|

Escaped pipes and empty cells:

| a | b | c |
|---|---|---|
| x \| y |  | z |
|  |  |  |

Indented by two spaces, which is still a table:

  | k | v |
  | - | - |
  | 1 | 2 |

Tabs between the pipes:

|	tabbed	|	cells	|
|	---	|	---	|
|	1	|	2	|

Trailing whitespace after the closing pipe:

| p | q |   
| - | - |
| 1 | 2 |  

The end.
