﻿function init() {
    if (window.goSamples) goSamples();  // init for these samples -- you don't need to call this
    var $ = go.GraphObject.make;  // for conciseness in defining templates

    myDiagram =
        $(go.Diagram, "myDiagramDiv", // must be the ID or reference to div
            {
                maxSelectionCount: 1, // users can select only one part at a time
                validCycle: go.Diagram.CycleDestinationTree, // make sure users can only create trees
                "clickCreatingTool.archetypeNodeData": { // allow double-click in background to create a new node
                    name: "(new person)",
                    title: "",
                    comments: ""
                },
                "clickCreatingTool.insertPart": function (loc) {  // scroll to the new node
                    var node = go.ClickCreatingTool.prototype.insertPart.call(this, loc);
                    if (node !== null) {
                        this.diagram.select(node);
                        this.diagram.commandHandler.scrollToPart(node);
                        this.diagram.commandHandler.editTextBlock(node.findObject("NAMETB"));
                    }
                    return node;
                },
                layout:
                    $(go.TreeLayout,
                        {
                            treeStyle: go.TreeLayout.StyleLastParents,
                            arrangement: go.TreeLayout.ArrangementHorizontal,
                            // properties for most of the tree:
                            angle: 90,
                            layerSpacing: 35,
                            // properties for the "last parents":
                            alternateAngle: 90,
                            alternateLayerSpacing: 35,
                            alternateAlignment: go.TreeLayout.AlignmentBus,
                            alternateNodeSpacing: 20
                        }),
                "undoManager.isEnabled": true // enable undo & redo
            });

    // when the document is modified, add a "*" to the title and enable the "Save" button
    myDiagram.addDiagramListener("Modified", function (e) {
        //var button = document.getElementById("SaveButton");
        //if (button) button.disabled = !myDiagram.isModified;
        var idx = document.title.indexOf("*");
        if (myDiagram.isModified) {
            if (idx < 0) document.title += "*";
        } else {
            if (idx >= 0) document.title = document.title.substr(0, idx);
        }
    });

    // manage boss info manually when a node or link is deleted from the diagram
    myDiagram.addDiagramListener("SelectionDeleting", function (e) {
        var part = e.subject.first(); // e.subject is the myDiagram.selection collection,
        // so we'll get the first since we know we only have one selection
        myDiagram.startTransaction("clear boss");
        if (part instanceof go.Node) {
            var it = part.findTreeChildrenNodes(); // find all child nodes
            while (it.next()) { // now iterate through them and clear out the boss information
                var child = it.value;
                var bossText = child.findObject("boss"); // since the boss TextBlock is named, we can access it by name
                if (bossText === null) return;
                bossText.text = "";
            }
        } else if (part instanceof go.Link) {
            var child = part.toNode;
            var bossText = child.findObject("boss"); // since the boss TextBlock is named, we can access it by name
            if (bossText === null) return;
            bossText.text = "";
        }
        myDiagram.commitTransaction("clear boss");
    });

    var levelColors = ["#AC193D", "#2672EC", "#8C0095", "#5133AB",
        "#008299", "#D24726", "#008A00", "#094AB2"];

    // override TreeLayout.commitNodes to also modify the background brush based on the tree depth level
    myDiagram.layout.commitNodes = function () {
        go.TreeLayout.prototype.commitNodes.call(myDiagram.layout);  // do the standard behavior
        // then go through all of the vertexes and set their corresponding node's Shape.fill
        // to a brush dependent on the TreeVertex.level value
        myDiagram.layout.network.vertexes.each(function (v) {
            if (v.node) {
                var level = v.level % (levelColors.length);
                var color = levelColors[level];
                var shape = v.node.findObject("SHAPE");
                if (shape) shape.fill = $(go.Brush, "Linear", { 0: color, 1: go.Brush.lightenBy(color, 0.05), start: go.Spot.Left, end: go.Spot.Right });
            }
        });
    };

    // when a node is double-clicked, add a child to it
    function nodeDoubleClick(e, obj) {
        var clicked = obj.part;
        if (clicked !== null) {
            var thisemp = clicked.data;
            myDiagram.startTransaction("add employee");
            var newemp = {
                name: "(new person)",
                title: "",
                comments: "",
                parent: thisemp.key
            };
            myDiagram.model.addNodeData(newemp);
            myDiagram.commitTransaction("add employee");
        }
    }

    // this is used to determine feedback during drags
    function mayWorkFor(node1, node2) {
        if (!(node1 instanceof go.Node)) return false;  // must be a Node
        if (node1 === node2) return false;  // cannot work for yourself
        if (node2.isInTreeOf(node1)) return false;  // cannot work for someone who works for you
        return true;
    }

    // This function provides a common style for most of the TextBlocks.
    // Some of these values may be overridden in a particular TextBlock.
    function textStyle() {
        return { font: "9pt  Segoe UI,sans-serif", stroke: "white" };
    }

    // This converter is used by the Picture.
    function findHeadShot(key) {
        if (key < 0 || key > 16) return "images/HSnopic.png"; // There are only 16 images on the server
        return "images/HS" + key + ".png"
    }

    // define the Node template
    myDiagram.nodeTemplate =
        $(go.Node, "Auto",
            { doubleClick: nodeDoubleClick },
            { // handle dragging a Node onto a Node to (maybe) change the reporting relationship
                mouseDragEnter: function (e, node, prev) {
                    var diagram = node.diagram;
                    var selnode = diagram.selection.first();
                    if (!mayWorkFor(selnode, node)) return;
                    var shape = node.findObject("SHAPE");
                    if (shape) {
                        shape._prevFill = shape.fill;  // remember the original brush
                        shape.fill = "darkred";
                    }
                },
                mouseDragLeave: function (e, node, next) {
                    var shape = node.findObject("SHAPE");
                    if (shape && shape._prevFill) {
                        shape.fill = shape._prevFill;  // restore the original brush
                    }
                },
                mouseDrop: function (e, node) {
                    var diagram = node.diagram;
                    var selnode = diagram.selection.first();  // assume just one Node in selection
                    if (mayWorkFor(selnode, node)) {
                        // find any existing link into the selected node
                        var link = selnode.findTreeParentLink();
                        if (link !== null) {  // reconnect any existing link
                            link.fromNode = node;
                        } else {  // else create a new link
                            diagram.toolManager.linkingTool.insertLink(node, node.port, selnode, selnode.port);
                        }
                    }
                }
            },
            // for sorting, have the Node.text be the data.name
            new go.Binding("text", "name"),
            // bind the Part.layerName to control the Node's layer depending on whether it isSelected
            new go.Binding("layerName", "isSelected", function (sel) { return sel ? "Foreground" : ""; }).ofObject(),
            // define the node's outer shape
            $(go.Shape, "Rectangle",
                {
                    name: "SHAPE", fill: "white", stroke: null,
                    // set the port properties:
                    portId: "", fromLinkable: true, toLinkable: true, cursor: "pointer"
                }),
            $(go.Panel, "Horizontal",
                $(go.Picture,
                    {
                        name: "Picture",
                        desiredSize: new go.Size(39, 50),
                        margin: new go.Margin(6, 8, 6, 10),
                    },
                    new go.Binding("source", "key", findHeadShot)),
                // define the panel where the text will appear
                $(go.Panel, "Table",
                    {
                        maxSize: new go.Size(150, 999),
                        margin: new go.Margin(6, 10, 0, 3),
                        defaultAlignment: go.Spot.Left
                    },
                    $(go.RowColumnDefinition, { column: 2, width: 4 }),
                    $(go.TextBlock, textStyle(),  // the name
                        {
                            row: 0, column: 0, columnSpan: 5,
                            font: "12pt Segoe UI,sans-serif",
                            editable: true, isMultiline: false,
                            minSize: new go.Size(10, 16)
                        },
                        new go.Binding("text", "name").makeTwoWay()),
                    $(go.TextBlock, "Title: ", textStyle(),
                        { row: 1, column: 0 }),
                    $(go.TextBlock, textStyle(),
                        {
                            row: 1, column: 1, columnSpan: 4,
                            editable: true, isMultiline: false,
                            minSize: new go.Size(10, 14),
                            margin: new go.Margin(0, 0, 0, 3)
                        },
                        new go.Binding("text", "title").makeTwoWay()),
                    $(go.TextBlock, textStyle(),
                        { row: 2, column: 0 },
                        new go.Binding("text", "key", function (v) { return "ID: " + v; })),
                    $(go.TextBlock, textStyle(),
                        { name: "boss", row: 2, column: 3, }, // we include a name so we can access this TextBlock when deleting Nodes/Links
                        new go.Binding("text", "parent", function (v) { return "Boss: " + v; })),
                    $(go.TextBlock, textStyle(),  // the comments
                        {
                            row: 3, column: 0, columnSpan: 5,
                            font: "italic 9pt sans-serif",
                            wrap: go.TextBlock.WrapFit,
                            editable: true,  // by default newlines are allowed
                            minSize: new go.Size(10, 14)
                        },
                        new go.Binding("text", "comments").makeTwoWay())
                )  // end Table Panel
            ) // end Horizontal Panel
        );  // end Node

    // the context menu allows users to make a position vacant,
    // remove a role and reassign the subtree, or remove a department
    myDiagram.nodeTemplate.contextMenu =
        $("ContextMenu",
            $("ContextMenuButton",
                $(go.TextBlock, "Vacate Position"),
                {
                    click: function (e, obj) {
                        var node = obj.part.adornedPart;
                        if (node !== null) {
                            var thisemp = node.data;
                            myDiagram.startTransaction("vacate");
                            // update the key, name, and comments
                            myDiagram.model.setDataProperty(thisemp, "name", "(Vacant)");
                            myDiagram.model.setDataProperty(thisemp, "comments", "");
                            myDiagram.commitTransaction("vacate");
                        }
                    }
                }
            ),
            $("ContextMenuButton",
                $(go.TextBlock, "Remove Role"),
                {
                    click: function (e, obj) {
                        // reparent the subtree to this node's boss, then remove the node
                        var node = obj.part.adornedPart;
                        if (node !== null) {
                            myDiagram.startTransaction("reparent remove");
                            var chl = node.findTreeChildrenNodes();
                            // iterate through the children and set their parent key to our selected node's parent key
                            while (chl.next()) {
                                var emp = chl.value;
                                myDiagram.model.setParentKeyForNodeData(emp.data, node.findTreeParentNode().data.key);
                            }
                            // and now remove the selected node itself
                            myDiagram.model.removeNodeData(node.data);
                            myDiagram.commitTransaction("reparent remove");
                        }
                    }
                }
            ),
            $("ContextMenuButton",
                $(go.TextBlock, "Remove Department"),
                {
                    click: function (e, obj) {
                        // remove the whole subtree, including the node itself
                        var node = obj.part.adornedPart;
                        if (node !== null) {
                            myDiagram.startTransaction("remove dept");
                            myDiagram.removeParts(node.findTreeParts());
                            myDiagram.commitTransaction("remove dept");
                        }
                    }
                }
            )
        );

    // define the Link template
    myDiagram.linkTemplate =
        $(go.Link, go.Link.Orthogonal,
            { corner: 5, relinkableFrom: true, relinkableTo: true },
            $(go.Shape, { strokeWidth: 4, stroke: "#00a4a4" }));  // the link shape

    // read in the JSON-format data from the "mySavedModel" element
    load();


    // support editing the properties of the selected person in HTML
    if (window.Inspector) myInspector = new Inspector("myInspector", myDiagram,
        {
            properties: {
                "key": { readOnly: true },
                "comments": {}
            }
        });
}

function SearchUserinLDAP() {
   
    var json = "";
    $.getJSON("http://localhost:55224/Home/SearchUserLDAP", function (result) {
        //json = JSON.stringify(result);
        setOrgModel(result);
    });

}


function setOrgModel(json) {
    //myDiagram.model = go.Model.fromJson(json);
    // make sure new data keys are unique positive integers
    json = json;
    return json;
    };
}