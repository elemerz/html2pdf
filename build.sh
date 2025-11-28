#!/bin/bash
export MAVEN_OPTS="--sun-misc-unsafe-memory-access=allow --enable-native-access=ALL-UNNAMED"
mvn clean install -DskipTests