/*!
 * Copyright 2018 - Swiss Data Science Center (SDSC)
 * A partnership between École Polytechnique Fédérale de Lausanne (EPFL) and
 * Eidgenössische Technische Hochschule Zürich (ETHZ).
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React, { Component } from 'react';
import { Row, Col } from 'reactstrap';
import dot from 'graphlib-dot';
import dagreD3 from 'dagre-d3';
import * as d3 from 'd3';
import './Lineage.css';

function nodeIdToPath(nodeId) { return nodeId.split(',')[1].slice(2, -2) }

function nodeIdToClass(nodeId, centralNode) {
  return (nodeId === centralNode[0]) ? 'central': 'normal'
}

class FileLineageGraph extends Component {
  constructor(props) {
    super(props);
    this._vizRoot = null;
  }

  graph() { return dot.read(this.props.dot) }

  allPredecessors(centralNode, accum={}) {
    const graph = this.graph();
    const directPreds = graph.predecessors(centralNode);
    directPreds.map(p => this.allPredecessors(p, accum));
    directPreds.forEach(p => { accum[p] = p });
    return accum;
  }

  allSuccessors(centralNode, accum={}) {
    const graph = this.graph();
    const directSuccs = graph.successors(centralNode);
    directSuccs.map(p => this.allSuccessors(p, accum));
    directSuccs.forEach(p => { accum[p] = p });
    return accum;
  }

  nodesAndEdges() {
    // Filter the graph to what is reachable from the central element
    const graph = this.graph();
    // This is an array with 1 or 0 elements
    const centralNode = graph.nodes().filter(n => nodeIdToPath(n) === this.props.path);
    const centralClosure = this.allPredecessors(centralNode);
    this.allSuccessors(centralNode, centralClosure);
    centralClosure[centralNode] = centralNode;
    const nodes = Object.keys(centralClosure)
    const edges =
      graph.edges()
        .filter(e => (centralClosure[e.v] != null) && (centralClosure[e.w] != null));
    return {nodes, edges, centralNode};
  }

  componentDidMount() {
    this.renderD3();
  }

  componentDidUpdate() {
    this.renderD3();
  }

  renderD3() {
    // Create the input graph
    const g = new dagreD3.graphlib.Graph()
      .setGraph({})
      .setDefaultEdgeLabel(function() { return {}; });

    const {nodes, edges, centralNode} = this.nodesAndEdges();
    console.log(centralNode);
    nodes.forEach(n => { g.setNode(n, {id: n, label: nodeIdToPath(n), class: nodeIdToClass(n, centralNode)}) });
    edges.forEach(e => { g.setEdge(e) });

    g.nodes().forEach(function(v) {
      const node = g.node(v);
      // Round the corners of the nodes
      node.rx = node.ry = 5;
    });


    // Create the renderer
    const render = new dagreD3.render();

    // Set up an SVG group so that we can translate the final graph.
    const svg = d3.select(this._vizRoot).select('svg'),
      svgGroup = svg.append('g');

    // Run the renderer. This is what draws the final graph.
    render(d3.select('svg g'), g);

    // Center the graph
    svg.attr('width', 500);
    const xCenterOffset = (svg.attr('width') - g.graph().width) / 2;
    svgGroup.attr('transform', 'translate(' + xCenterOffset + ', 20)');
    svg.attr('height', g.graph().height + 40);
  }

  render() {
    return <div ref={(r) => this._vizRoot = r}><svg><g></g></svg></div>
  }
}

class FileLineage extends Component {
  render() {
    const graph = (this.props.dot) ?
      <FileLineageGraph path={this.props.path} dot={this.props.dot} /> :
      <p>Loading...</p>;
    return [<Row key="header"><Col><h3>{this.props.path}</h3></Col></Row>,
      <Row key="graph"><Col>{graph}</Col></Row>
    ]
  }
}

export { FileLineage };
