@echo off
java --sun-misc-unsafe-memory-access=allow --enable-native-access=ALL-UNNAMED -jar target/benchmarks.jar FastInvoiceBenchmark -p fileCount=100 -p invoiceTypes="20"