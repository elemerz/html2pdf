The current folder: `html2pdf` represents an invoicing system with the following sub-modules:
A: `fe-designer-dragdrop`: Visual Report template designer written in Angular 20.x. Outputs: XHTML templates to be used by the `invoice-parser` submodule.
B: `invoice-parser`: 
  - parses data model from zip files having `classic` and `xml` content, residing in an input folder, configured in application.properties.
  - Crafts a JSON Data modsel from the zip file content.
  - Based on JSONModel.MetaInfo.invoiceType picks up from resource folder an Xhtml template produced by the `fe-designer-dragdrop` frontend. 
  - Requests JSONModel.MetaInfo.invoiceCount pieces of PDF reports to be created by: `xhtml2pdf` submodule.
  - Passes [XhtmlTemplateString, JSONModel] to xhtml2pdf submodule and gets back the PDF reports as Base64-encoded yte array.
C: `xhtml2pdf`: 
  - produces MetaInfo.invoiceCount pieces of PDF reports in multi-threaded way, based on the Xhtml and JSON model receivedameters from the `invoice-parser` module.
  - The generated PDF-bytes are given back to the `invoice-parser` to be saved by this into a configurable folder.
