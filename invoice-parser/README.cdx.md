# Project: Invoice Parser

Spring Boot 3.5.7 application for parsing Patient, Doctor and treatment information 
from text 3 files packed in *.zip format.
The 3 text files are:
- *_Meta.txt(each line: InvoiceType: invoiceCount): each line says: how many invoices (count) need to be generated from which 
  InvoiceType (type 1, type 2, ..., type68). Most "count" values used to be 0. Usually for one
  of the Invoice Types the count is > 0;
- *_Debiteuren.txt: Debtor info. Format: CSV: separator=';'. n-1 lines: Debtor data. Last line: Doctor data.
- *_Specificaties.txt: Treatment info. Format: CSV: separator=';'. Treatment data. First column: key to the patient.

## Purpose
Parse out info from the 3 packed files and compose a JSON "data model" to serve as data model for the XHTML report templates.

## Libraries
- Spring Boot 3.5.7
- univocity-parsers: Fast CSV parser.


## Java
- Version: 22
- Build: Maven 3.9.x

## Typical Usage
Input: Zip file
Output: JSON string written to a configurable folder (application.properties)
