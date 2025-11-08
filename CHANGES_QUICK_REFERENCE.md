# Quick Reference: Files Changed

## New Files Created

### invoice-parser
1. `src/main/java/nl/infomedics/invoicing/model/SingleDebtorInvoice.java`
   - New model for single-debtor invoices

### xhtml2pdf
1. `src/main/java/nl/infomedics/xhtml2pdf/web/dto/BatchConversionItem.java`
2. `src/main/java/nl/infomedics/xhtml2pdf/web/dto/BatchConversionRequest.java`
3. `src/main/java/nl/infomedics/xhtml2pdf/web/dto/BatchConversionResultItem.java`
4. `src/main/java/nl/infomedics/xhtml2pdf/web/dto/BatchConversionResponse.java`
   - DTOs for batch conversion API

## Modified Files

### invoice-parser
1. `src/main/java/nl/infomedics/invoicing/service/JsonAssembler.java`
   - Added: `createSingleDebtorInvoice()`
   - Added: `stringifySingleDebtor()`

2. `src/main/java/nl/infomedics/invoicing/service/Xhtml2PdfClient.java`
   - Added: `convertBatch()` method
   - Added: Batch-related record types
   - Modified: Constructor to initialize batch endpoint

3. `src/main/java/nl/infomedics/invoicing/service/ZipIngestService.java`
   - Modified: `processZip()` - now calls `generatePdfsPerDebtor()`
   - Added: `generatePdfsPerDebtor()` - main per-debtor logic
   - Added: `submitBatchPdfConversion()` - batch submission
   - Added: `convertBatchPdfs()` - batch conversion + file writing
   - Added: `sanitizeFilename()` - filename sanitization
   - Added: Imports for MetaInfo and Practitioner

### xhtml2pdf
1. `src/main/java/nl/infomedics/xhtml2pdf/web/HtmlToPdfController.java`
   - Added: `convertBatch()` endpoint (POST /api/v1/pdf/convert-batch)
   - Added: `convertSingleItem()` helper method
   - Added: Necessary imports

## Key Behavioral Changes

### invoice-parser Output
**Before**: `{zipName}.pdf` (single file)
**After**: `{zipName}_{invoiceNumber}.pdf` (one per debtor)

### xhtml2pdf API
**New Endpoint**: POST /api/v1/pdf/convert-batch
**Request**: List of {html, jsonModel, outputId}
**Response**: List of {outputId, pdfBase64, error}

## Build Status
✅ xhtml2pdf: Compiled successfully
✅ invoice-parser: Compiled successfully

Both modules packaged and ready for deployment.
