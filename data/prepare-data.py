import csv
import os.path
import pymongo
import subprocess
import sys

## {{{ http://code.activestate.com/recipes/511478/ (r1)
import math
import functools

def percentile(N, percent, key=lambda x:x):
    """
    Find the percentile of a list of values.

    @parameter N - is a list of values. Note N MUST BE already sorted.
    @parameter percent - a float value from 0.0 to 1.0.
    @parameter key - optional key function to compute value from each element of N.

    @return - the percentile of the values
    """
    if not N:
        return None
    k = (len(N)-1) * percent
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return key(N[int(k)])
    d0 = key(N[int(f)]) * (c-k)
    d1 = key(N[int(c)]) * (k-f)
    return d0+d1
## end of http://code.activestate.com/recipes/511478/ }}}


# Connect to the local Mongo server
try:
    client = pymongo.MongoClient('localhost', 27017, serverSelectionTimeoutMS=100)
    client.admin.command('ismaster') # Test command to see if we can connect

    # If we can conenct, reset client to defaults
    print("Successfully connected to MongoDB...")
    client = pymongo.MongoClient('localhost', 27017)
except pymongo.errors.ConnectionFailure:
    sys.exit("ERROR: Could not connect to database, are you sure 'mongod' is running?")

# Create 'masters' database
if not 'masters' in client.database_names():
    print("Database 'masters' was not found, creating...")
else:
    print("Found database 'masters'...")
db = client['masters']

# Import NSR data
if not 'NSR' in db.collection_names():
    if not os.path.isfile("NSR.json"):
        if os.path.isfile("mastersNSRDataDump.tbz2"):
            print("Could not find database file NSR.json...")
            print("Found mastersNSRDataDump.tbz2, extracting...")
            subprocess.call(["tar",  "-xf", "mastersNSRDataDump.tbz2"])
            subprocess.call(["mv",  "NSRDump.out", "NSR.json"])
            print("Running perl magic...")
            subprocess.call(["perl", "parseNSRtoJSON.pl", "NSR.json"])
            subprocess.call(["perl", "massageJSONtoSchema.pl", "NSR.json"])
            subprocess.call(["perl", "flattenJSONforMongo.pl", "NSR.json"])
    if os.path.isfile("NSR.json"):
        print("NSR collection not found, importing NSR.json with mongoimport...")
        subprocess.call(["mongoimport",  "--db",  "masters",  "--collection",  "NSR",  "--type",  "json",  "--file",  "NSR.json"])
    else:
        sys.exit("ERROR: Could not find data files NSR.json or mastersNSRDataDump.tbz2")
print("Found NSR collection...")

# Create collection authorSummary
if not 'authorSummary' in db.collection_names():
    print("Collection authorSummary not found, creating...")
    db.NSR.aggregate([
        {"$project": {"_id": 1, "copyauthors": "$authors", "authors": 1, "year": 1}},
        {"$unwind": "$authors"},
        {"$unwind": "$copyauthors"},
        {"$group": {"_id": "$authors", "coauthors": {"$addToSet": "$copyauthors"}, "years": {"$addToSet": "$year"},
            "papers": {"$addToSet": "$_id"}}},
        {"$out": "authorSummary"}
    ], allowDiskUse=True)

# Create collection authorSummaryByYear
if not 'authorSummaryByYear' in db.collection_names():
    print("Collection authorSummaryByYear not found, creating...")
    db.NSR.aggregate([
        {"$project": {"_id": 1, "copyauthors": "$authors", "authors": 1, "year": 1}},
        {"$unwind": "$authors"},
        {"$unwind": "$copyauthors"},
        {"$group": {"_id": {"author": "$authors", "year": "$year"}, "coauthors": {"$addToSet": "$copyauthors"},
            "papers": {"$addToSet": "$_id"}}},
        {"$out": "authorSummaryByYear"}
    ], allowDiskUse=True)


# Generate authorSummary tsv for clustering
print("Aggregating authorSummary data...")
authorSummary_pipeline = [
    {"$project": {"_id": 0, "author": "$_id", "numCoauthors": {"$size": "$coauthors"},
                  "numYears": {"$size": "$years"}, "numEntries": {"$size": "$papers"}}}
    ]
results = db.authorSummary.aggregate(authorSummary_pipeline, allowDiskUse=True)
with open('author-cluster-input.tsv', 'w', newline='') as tsvfile:
    print("Writing authorSummary data to file...")
    cluster_writer = csv.writer(tsvfile, delimiter='\t')
    cluster_writer.writerow(["author", "numCoauthors", "numYears", "numEntries"])
    for document in results:
        cluster_list = [document['author']]
        cluster_list.append(document['numCoauthors'])
        cluster_list.append(document['numYears'])
        cluster_list.append(document['numEntries'])
        cluster_writer.writerow(cluster_list)


# Generate authorSummaryByYear tsv for clustering
print("Aggregating authorSummaryByYear data...")
authorSummaryByYear_pipeline = [
    {"$group": {"_id": "$_id.author", "yearData": {"$push": {"year": "$_id.year",
                "numCoauthors": {"$size": "$coauthors"}, "numEntries": {"$size": "$papers"}}}}}
    ]
results = db.authorSummaryByYear.aggregate(authorSummaryByYear_pipeline, allowDiskUse=True)
with open('author-cluster-entry-quartiles-input.tsv', 'w', newline='') as tsvfile:
    print("Writing authorSummaryByYear data to file...")
    cluster_writer = csv.writer(tsvfile, delimiter='\t')
    cluster_writer.writerow(["author", "numCoauthors", "numYears", "numEntries025", "numEntries050", "numEntries075", "numEntries100"])
    for document in results:
        years = []
        entries = []
        coauthors = []
        for yearDatum in document['yearData']:
            years.append(yearDatum['year'])
            coauthors.append(yearDatum['numCoauthors'])
            entries.append(yearDatum['numEntries'])
        sumEntries = entries.copy()
        for i, entry in enumerate(sumEntries):
            if i >= 1:
                sumEntries[i] = sumEntries[i] + sumEntries[i-1]
        numEntries025 = math.floor(percentile(sumEntries, 0.25))
        numEntries050 = math.floor(percentile(sumEntries, 0.50))
        numEntries075 = math.floor(percentile(sumEntries, 0.75))
        numEntries100 = sumEntries[-1]
        cluster_list = [document['_id']]
        cluster_list.append(len(coauthors))
        cluster_list.append(len(years))
        cluster_list.append(numEntries025)
        cluster_list.append(numEntries050)
        cluster_list.append(numEntries075)
        cluster_list.append(numEntries100)
        cluster_writer.writerow(cluster_list)

# Generate transactions tsv for association rule learning
print("Aggregating transaction data...")
selectorAuthors_pipeline = [
    {"$match": {"selectors.type":"N"}},
    {"$unwind": "$selectors"},
    {"$unwind": "$authors"},
    {"$group": {"_id": "$selectors.value", "authors": {"$addToSet": "$authors"}}}
]
results = db.NSR.aggregate(selectorAuthors_pipeline, allowDiskUse=True)
with open('transactionsSelectorAuthors.tsv', 'w', newline='') as tsvfile:
    print("Writing transaction data to file...")
    transaction_writer = csv.writer(tsvfile, delimiter='\t')
    for document in results:
        transaction_list = document['authors']
        transaction_list.insert(0, document['_id'])
        transaction_writer.writerow(transaction_list)
