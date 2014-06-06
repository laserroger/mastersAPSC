// Wait for DOM to finish loading.
$(document).ready(function() {
    // Ready!
    console.log('READY!');

    var aggregate = function(collection, pipeline, options, callback) {
        $.get(
            "/api/v1/"+collection+"/aggregate",
            {
                "pipeline": JSON.stringify(pipeline || []),
                "options": JSON.stringify(options || {})
            }
        ).done(function(results) {
            return callback && callback(results);
        });
    };

    var graph = function(selector, title, collection, pipeline, options, queryType, callback) {
        aggregate(collection, 
            pipeline,
            options,
            function(results) {
                var data = [{
                    key: title,
                    values: results
                }];
                console.log("Graph: %s", queryType.graph);
                console.log(data);
                
                switch(queryType.graph){
                    case 'discreteBarChart':
                        nv.addGraph(discreteBarChart(selector, title, data, callback));
                        break;
                    case 'multiBarChart':
                        //minYear = results[0].values[0].x;
                        //maxYear = results[0].values[results[0].values.length-1].x;
                        for (var i =0; i<results.length; i++) {
                            results[i].values.sort(function(a, b){return a.x-b.x})
                            //minYear = Math.min(minYear,results[i].values[0].x);
                            //maxYear = Math.max(maxYear,results[i].values[results[i].values.length-1].x);
                        }
                        //console.log("minYear:"+minYear+" maxYear:"+maxYear);
                        nv.addGraph(multiBarChart(selector, title, results, callback));
                        break;
                    case 'pieChart':
                        nv.addGraph(pieChart(selector, title, data, callback));
                        break;
                    case 'lineWithFocusChart':
                        nv.addGraph(lineWithFocusChart(selector, title, data, callback));
                        break;
                    default:
                        console.log("# No valid graph type detected.")
                }

            });//end of aggregate callback
    };//end of graph function

    var search = $("#omnisearchform");
    console.log("main.js search grabbed?...");
    search.submit(function(ev){

        //Make a function with error checking
        var searchterms = search.serializeArray();
        var queryterm = searchterms[0].value;
        console.log(queryterm);

        //Remove old charts, put in new ids
        $("#charts").empty();
        $("#charts").append('<svg id="search"></svg>');

        // Multi Bar Chart
        queryType = {graph: "multiBarChart", minYear: 1896, maxYear: 2011}
        graph(
            "#charts svg#search", 
            "NSR Data", 
            "NSR", 
            [
                  {$match: {$text: {$search: queryterm}}},
                  {$group: { _id: {type: "$type", year: "$year"}, total: { $sum: 1} } }, 
                  {$sort: {"_id.year": 1}},
                  {$group: {_id: "$_id.type", values: {$push: {x: "$_id.year", y: "$total"}}}}, 
                  {$project: {_id:0, key: "$_id", values: "$values"}}
           ],
            {},
            queryType,
            function(chart, data){
            }
        );//end multibar graph

        ev.preventDefault();
    });//end of search


//
//   GRAPH MODELS
//

    //Define discreteBarChart
    discreteBarChart = function(selector, title, data, callback) {
        var chart = nv.models.discreteBarChart()
            .x(function(d) { return d.label })    //Specify the data accessors.
            .y(function(d) { return d.value })
            .staggerLabels(false)
            .tooltips(true) 
            .showValues(false)
            .transitionDuration(350)
            ;

        callback && callback(chart);
        d3.select(selector)
            .datum(data)
            .call(chart);

        nv.utils.windowResize(chart.update);
        return chart;
      };

    //Define pieChart
    pieChart = function(selector, title, data, callback) {
        var chart = nv.models.pieChart()
            .x(function(d) { return d.label })
            .y(function(d) { return d.value })
            .showLabels(true);

        callback && callback(chart, data);
        d3.select(selector)
            .datum(data[0].values)
            .transition().duration(350)
            .call(chart);

        return chart;
      };

    //Define lineWithFocusChart
    lineWithFocusChart = function(selector, title, data, callback) {
        var chart = nv.models.lineWithFocusChart();

        callback && callback(chart, data);
        d3.select(selector).enter().append()
            .datum(data)
            .transition().duration(500)
            .call(chart);

        nv.utils.windowResize(chart.update);
        return chart;
      };

    //Define multiBarChart 
    multiBarChart = function(selector, title, data, callback) {
        console.log("derping the results:");
        console.log(data);
        var chart = nv.models.multiBarChart()
          //.transitionDuration(350)
          .reduceXTicks(false)   //If 'false', every single x-axis tick label will be rendered.
          .rotateLabels(90)      //Angle to rotate x-axis labels.
          .showControls(true)   //Allow user to switch between 'Grouped' and 'Stacked' mode.
          .groupSpacing(0.05)    //Distance between each group of bars.
        ;
    
        chart.xAxis
            .tickFormat(d3.format('f'));
    
        chart.yAxis
            .tickFormat(d3.format('f'));

        d3.select(selector)
            .datum(data)
            .transition().duration(1)
            .call(chart);
    
        nv.utils.windowResize(chart.update);
        return chart;
    };


//
//   GRAPH VIEWS
//

    // Graph yearly summary
    queryType = {graph: "discreteBarChart", minYear: 1896, maxYear: 2011}
    graph(
        "#charts svg#yearly", 
        "NSR Data", 
        "NSR", 
        [
            { $group: { _id: "$year", total: { $sum: 1} } },
            { $sort: {_id: 1} },
            {$project: {_id: 0, label: "$_id", value: "$total" } } 
        ],
        {},
        queryType,
        function(chart){
            chart.yAxis.tickFormat(d3.format('.0f'));
            chart.xAxis.tickValues([1899,1910,1920,1930,1940,1950,1960,1970,1980,1990,2000,2010]);
        }
    );

    // Doctype Bar Chart
    queryType = {graph: "discreteBarChart", minYear: 1896, maxYear: 2011}
    graph(
        "#charts svg#doctypes", 
        "NSR Data", 
        "NSR", 
        [
             { $group: { _id: "$type", total: { $sum: 1} } },
             { $sort: {total: -1}},
             { $limit: 8},
             { $sort: {_id: -1}},
             { $limit: 7},
             { $project : {_id : 0, label : "$_id", value : "$total"} },
             { $sort: {value: -1} }
        ],
        {},
        queryType,
        function(chart, data){
        }
    );

    // Doctype Pie
    queryType = {graph: "pieChart", minYear: 1896, maxYear: 2011}
    graph(
        "#charts svg#doctypes2", 
        "NSR Data", 
        "NSR", 
        [
             { $group: { _id: "$type", total: { $sum: 1} } },
             { $sort: {total: -1}},
             { $limit: 8},
             { $sort: {_id: -1}},
             { $limit: 7},
             { $project : {_id : 0, label : "$_id", value : "$total"} },
             { $sort: {value: -1} }
        ],
        {},
        queryType,
        function(chart, data){
            chart.labelThreshold(.01)
            .donut(true).donutLabelsOutside(true).donutRatio(0.2);
        }
    );

    // Prolific authors
    queryType = {graph: "pieChart", minYear: 1950, maxYear: 1980}
for (i=1950; i<=1970; i=i+10) {
    graph("#charts svg#prolific"+(i-1900), "NSR Data", "NSR", 
        [
             { $match: {"year": {$gt: i, $lte: i+10}}},
             { $unwind: "$authors"},
             { $group: { _id: "$authors", total: { $sum: 1} } },
             { $match: {total: {$gt: i-1925} } },
             { $project: {_id: 0, label: "$_id", value: "$total" } }
        ], {},
        queryType,
        function(chart, data){
            chart.labelThreshold(.01)
            .donut(true).donutLabelsOutside(true).donutRatio(0.3)
            .showLabels(false).showLegend(false);
            //function isBigEnough(value) {
            //  return function(element, index, array) {
            //    return (element.value >= value);
            //  }
            //}
            //d3.select("#charts svg#prolific70").datum(data[0].values.filter(isBigEnough(40))).transition().duration(350).call(chart);
        }
    );
}


    // Multi Bar Chart
    queryType = {graph: "multiBarChart", minYear: 1965, maxYear: 1985}
    graph(
        "#charts svg#yearlyMulti", 
        "NSR Data", 
        "NSR", 
        [
              {$match: {"year": {$gte: 1965, $lte: 1985}}},
              {$group: { _id: {type: "$type", year: "$year"}, total: { $sum: 1} } }, 
              {$sort: {"_id.year": 1}},
              {$group: {_id: "$_id.type", values: {$push: {x: "$_id.year", y: "$total"}}}}, 
              {$project: {_id:0, key: "$_id", values: "$values"}}

       ],
        {},
        queryType,
        function(chart, data){
        }
    );




}); //Thats all folks
