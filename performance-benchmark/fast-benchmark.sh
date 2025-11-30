#!/bin/bash
java --sun-misc-unsafe-memory-access=allow --enable-native-access=ALL-UNNAMED -jar target/benchmarks.jar FastInvoiceBenchmark -p invoiceTypes="20,27,42" "$@"