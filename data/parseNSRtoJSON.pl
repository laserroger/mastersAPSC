#!/usr/bin/perl -pi

use strict;
use warnings;

# This helps with multiline regex
BEGIN {undef $/;}

# Cleaning up the CODEN's
s/^<CODEN   >(JOYR|JUOUR|JOur|PRVCA|Nature|J\{OUR) /<CODEN   >JOUR /mg;
s/^<CODEN   >Conf /<CODEN   >CONF /mg;
s/^<CODEN   >(REPR|REP>T|REPTT|Rept) /<CODEN   >REPT /mg;
s/^<CODEN   >Book /<CODEN   >BOOK /mg;
s/^<CODEN   >(THE{SIS|Thesis,) /<CODEN   >THESIS /mg;

# Force any remaining problems to simply be type UNKNOWN
s/^<CODEN   >(?!JOUR)(?!REPT)(?!CONF)(?!THESIS)(?!PC)(?!PREPRINT)/<CODEN   >UNKNOWN /mg;

# Remove tailing whitespace and tabs
s/\t/  /g;
s/ {2,}&$/&/mg;

# Escape double quotes
s/"/\\"/g;

# Collapse all multiline entries to single line
s/&\n(.)(?!KEYNO)(?!HISTORY)(?!CODEN)(?!REFRENCE)(?!AUTHORS)(?!TITLE)(?!KEYWORDS)(?!SELECTRS)(?!DOI)/$1/mg;

# Basic parsing
s/^<KEYNO   >(.*)&$/{\n"_id":"$1",/mg;
s/^<HISTORY >(.*)&$/"history":["$1"],/mg;
s/^<CODEN   >(.*)&$/"code":"$1",/mg;
s/^<REFRENCE>(.*)&$/"reference":"$1",/mg;
s/^<AUTHORS >(.*)&$/"authors":["$1"],/mg;
s/^<TITLE   >(.*)&$/"title":"$1",/mg;
s/^<DOI     >(.*)&$/"DOI":"$1",/mg;
s/^<KEYWORDS>(.*)&$/"keywords":["$1"],/mg;
s/^<SELECTRS>(.*)&$/"selectors":["$1"],/mg;

# End JSON structures
s/,\n{/\n}\n{/mg; 
s/$/\n}/;
