##Object Positioning
-Avoid Position: absolute. Solve it via Margins, and "normal document flow"

##Zoom
- Click Magnifier icon => drag a box to zoom into a specific area. The selected zone takes the whole viewport.
- Shift-F4: Zoom to full Page.

##Ruler
- Add Horizontal and Vertical rulers

##Layout Tables
- Drop Target can be a selected Table cell as well
- Drop Position markers: mark the position where the object will be dropped when the mouse will release:
  - Anchor to: top of Page
  - Anchor to: Before an object
  - Anchor to: After an object

##Content Editor
- Insert content inside a Table cell:
  - Add Rich Text editing capabilities to a content zone
  - Select cell => Add Content Icon => Rich Editor Opens inside a Full-Screen Popup:
    - OnSave => Rich Content Saved back to edited Cell
##Lightweight Database
- Setup some Lightweight DB to store predefined objects.
##Define Reusable Components
-Toolbar zone: Add Category for reusable components.
-Preload Predefined objects from Lightweight Db.
- Ability to save (under a name):
  - Whole page as Reusable component.
  - Selected Objects as Reusable component.
##Ability to define Header, Body, Footer

##SUPPORT <HEADER> and <FOOTER> and <DIV class="report-body"></DIV> Tags.


- Remove DIV-s intercalated between splitted cell and sub-Table
- Set Default zoom to 1:1 when Opening the App.
- Allow sub-cells to be resized

To fix:
-  Allow cel resize for any nesting level => Ok
- Text align apply to any level. => ok.
- Apply borders individually
- Make cell selection easier
## Still to implement (Not in POC)
- Own Database support
- Support Dynamic report variables
- Support QRCode and Barcode in designer
- Custom Font management
- Logo image management
- Image optimizations (at least png, if possible also SVG)
- Extend scalability above virtual threads (Kafka, etc)
- Pass data via REST API instead of physical files
- Use anchor-positioning for resize handles, cog and .action-toolbar
