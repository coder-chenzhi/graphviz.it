define('palette',[],function () {
  function path(points, command, close) {
    return [
      "M",
      [points[0][0], -points[0][1]].join(','),
      command,
      points.slice(1, points.length)
        .map(function (e) {
          return [e[0], -e[1]].join(",");
        }), close===true ? "Z" : ""
    ].join(" ").trim();
  }

  return {
    polygon: function (d) {
      return path(d.points, "L", true);
    },
    ellipse: function (d) {
      return [
        'M', [d.cx, -d.cy].join(','),
        'm', [-d.rx, 0].join(','),
        'a', [d.rx, d.ry].join(','),
        0, "1,0", [2 * d.rx, 0].join(','),
        'a', [d.rx, d.ry].join(','),
        0, "1,0", [-2 * d.rx, 0].join(',')].join(' ');
    },
    circle: function (d) {
      return this.ellipse({
        cx: d.cx,
        cy: -d.cy,
        rx: d.r,
        ry: d.r
      });
    },
    rect: function (d) {
      return this.polygon({
        points: [
          [d.x, -d.y],
          [d.x + d.width, -d.y],
          [d.x + d.width, -d.y + d.height],
          [d.x, -d.y + d.height]
        ]
      });
    },
    path: function (d) {
      return path(d.points, "C");
    },
    bspline: function (d) {
      return path(d.points, "C");
    },
    polyline: function (d) {
      return path(d.points, "L");
    }
  };
});
define('transitions/default',[], function() {
  return {
    stage: function (svg, width, height, scaleWidth, scaleHeight, vtranslate, htranslate) {
      svg
        .transition()
        .delay(150)
        .duration(700)
        .attr("width", width + "pt")
        .attr("height", height + "pt")
        .attr("viewBox", [0, 0, width, height].join(' '))
        .select("g")
        .attr("transform", "scale(" + scaleWidth + " " + scaleHeight + ")" + " " + "translate(" + vtranslate + "," + htranslate + ")");
    },
    nodes: function (nodes) {
      nodes.style("opacity", 0.0)
        .transition()
        .delay(150)
        .duration(900)
        .style("opacity", 1.0);
    },
    relations: function (relations) {
      relations.style("opacity", 0.0)
        .transition()
        .delay(150)
        .duration(900)
        .style("opacity", 1.0);
    },
    exits: function (exits) {
      exits.transition()
        .duration(100)
        .style("opacity", 0.0)
        .remove();
    },
    shapes: function (shapes, palette) {
      shapes
        .transition()
        .delay(150)
        .duration(900)
        .attr("d", function (d) {
          var shape = d.shape;
          return palette[shape](d);
        })
        .attr("style", function (d) {
          return d.style.map(function (e) {
            return [e.key, e.value].join(':');
          }).join(';');
        });
    },
    labels: function (labels) {
      labels
        .transition()
        .delay(150)
        .duration(900)
        .attr("x", function (d) {
          return d.x;
        })
        .attr("y", function (d) {
          return -d.y;
        })
        //.attr("text-anchor","middle")
        //.attr("style", function(d) {
        //  return d.style.map(
        //    function(e){
        //      return [e.key,e.value].join(':');
        //    }).join(';');
        //})
        .text(function (d) {
          return d.text;
        });
    }
  };
});
define('stage',["d3", "palette", "transitions/default"], function (d3, palette, defaults) {
    var svg, main;
    var order = {
      digraph: 0,
      subgraph: 1,
      node: 2,
      relation: 3
    };
    var transitions = defaults;

    return {
      init: function (element) {
        svg = d3.select(element).append("svg");
        main = svg.append("g");
      },
      transitions: function(custom) {
        if (custom) {
          transitions = custom;
        } else {
          return transitions;
        }
      },
      draw: function (stage) {
        var margin = 2,
          boundingWidth = stage.main.shapes[0].points[2][0] + margin*2,
          boundingHeight = stage.main.shapes[0].points[2][1] + margin*2,
          htranslate = stage.main.shapes[0].points[2][1] + margin,
          vtranslate = margin,
          size = stage.main.size || [boundingWidth, boundingHeight];
        var oversized = boundingWidth > size[0] || boundingHeight > size[1];
        var scaleWidth = oversized ? size[0] / boundingWidth : 1;
        var scaleHeight = oversized ? size[1] / boundingHeight : 1;
        var ratio = scaleHeight > scaleWidth ? scaleHeight = scaleWidth : scaleWidth = scaleHeight;
        var height = boundingHeight * ratio;
        var width = boundingWidth * ratio;

        transitions.stage(svg, width, height, scaleWidth, scaleHeight, vtranslate, htranslate);

        var groups = main.selectAll("g")
        .data(stage.groups, function (d) {
          return d.id;
        });
        var entering = groups.enter()
        .append("g").attr("class", function (d) {
          return d.class;
        });
        entering.append("title").text(function (d) {
          return d.id;
        });

        transitions.nodes(entering.filter(".node"));
        transitions.relations(entering.filter(".relation"));
        transitions.exits(groups.exit());

        groups.sort(function(a,b){
          return order[a.class]- order[b.class];
        });

        var shapes = groups.selectAll("path").data(function (d) {
            return d.shapes;
          }, function (d, i) {
            return [d.shape, i].join('-');
          }
        );
        shapes.enter().append("path");
        transitions.shapes(shapes, palette);

        var labels = groups.selectAll("text").data(function (d) {
          return d.labels;
        });
        labels.enter().append("text");
        transitions.labels(labels);
      }
    };
  }
);
define('worker',[],function () {
	return {
		version: "1.0.1",
		load: function (name, req, onLoad, config) {
			if (config.isBuild) {
				//don't do anything if this is a build, can't inline a web worker
				onLoad();
				return;
			}

			var url = req.toUrl(name);

			if (window.Worker) {
				onLoad(new Worker(url));
			} else {
				req(["worker-fake"], function () {
					onLoad(new Worker(url));
				});
			}
		}
	};
});

define('renderer',["stage", "worker!layout-worker.js"], function(stage, worker) {

  var initialized = false, pending, callback;

  worker.onmessage = function (event) {
    switch (event.data.type) {
      case "ready":
        initialized = true;
        if (pending) {
          worker.postMessage(pending);
        }
        break;
      case "stage":
        stage.draw(event.data.body);
        break;
      case "error":
        if (callback) {
          callback(event.data.body);
        }
    }
  };

  return {
    init: function(element) {
      stage.init(element);
    },
    render: function(source) {
      if (initialized) {
        worker.postMessage(source);
      } else {
        pending = source;
      }
    },
    errorHandler: function(handler) {
      callback = handler;
    }
  };

});
