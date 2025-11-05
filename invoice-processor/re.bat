@ECHO off
title Invoice Processor
call build.bat

TIMEOUT /T 2
call start.bat