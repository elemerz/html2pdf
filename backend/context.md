* **XHTML to PDF bulk-converter application**
* **Technologies Used: Angular 20.x, Nvm, Node 20+, Npm 10+**
* **Aimed to design HTML reports composing it from:
  - Primitive HTML Tags (Paragraph, Heading, List, Label, Div, Section, Image etc)**
* **- Composite (user-created) HTML Tags like: QRCode, BarCode, "Address Holder", "Header", Footer**

This SpringBoot 3.5.x (on Java 21+ and Maven 3.9.x) application is the backend for an Angular 20 project (the Frontend)
implementing an HTML Report Template Designer using.
The goal is to build the backend for a user-friendly, A4-page-focused, drag-and-drop designer, supporting 
saving/loading XHTML templates, and allows custom reusable components.

The self-contained HTML+CSS+InlineImages will be transformed by this Backend into 
PDF-s.

High-Level Requirements of This Backend:

Frameworks used: 
 - Java 21+
 - Maven 3.9.x
 - SpringBoot 3.5.x
 - OpenHtmlToPdf + Plugins.
 
Functional Requirements:
- Support Images: png, inline png; gif, inline gif; SVG;
- Support Barcodes
- Support QRCodes
- Support Custom fonts
 
Non-functional Requirements:
- High Performance needed:
 - ~1000000 conversions/week
 - Peeks /day: 300000 conversions
- Java Virtual Threads are used.
- Logging and Auditing
