import { Component, HostListener, Input, OnChanges, OnInit, SimpleChange, ViewChild } from '@angular/core';
import { Link, NetworkGraph, Node } from '../../models/NetworkGraph';
import * as d3 from 'd3';
import { Simulation, SimulationLinkDatum, SimulationNodeDatum } from 'd3';
import * as d3Scale from 'd3-scale';
import * as deepEqual from 'deep-equal';

interface SimulationNode extends SimulationNodeDatum, Node {
}

interface SimulationLink extends SimulationLinkDatum<SimulationNode>, Link {
}

@Component({
  selector: 'app-network-graph',
  templateUrl: './network-graph.component.html',
  styleUrls: ['./network-graph.component.css']
})
export class NetworkGraphComponent implements OnInit, OnChanges {
  private static NORMAL_COLOR = '#1A237E';
  private static HIGHLIGHT_COLOR = '#2E41FF';
  private static SELECTED_COLOR = '#00b409';

  private static NODE_OPACITY = 0.3;

  @Input() data: NetworkGraph;
  @ViewChild('graph') graph;
  private width: number;
  private height: number;

  private initialWidth: number;
  private initialHeight: number;

  private svg: d3.Selection<any, NetworkGraph, any, any>;
  private link: any;
  private node: any;

  private color: d3.ScaleOrdinal<string, any>;

  private simulation: Simulation<SimulationNode, SimulationLink>;

  private circleSize: (value: number) => number;
  private initialized = false;

  private graphData: { nodes: SimulationNode[], links: SimulationLink[] } = {nodes: [], links: []};


  constructor() {
  }

  private static nodeCompare() {
    return (datum: Node) => `${datum.id}-${datum.tokenAddress}`;
  }

  private static linkCompare() {
    return (datum: Link) => `${datum.sourceAddress}-${datum.targetAddress}-${datum.tokenAddress}`;
  }

  ngOnChanges(changes: { [propKey: string]: SimpleChange }) {

    if (!changes.hasOwnProperty('data')) {
      return;
    }

    const change = changes['data'];

    if (change.isFirstChange()) {
      return;
    }

    if (deepEqual(change.previousValue, change.currentValue)) {
      return;
    }

    this.prepareGraphData();
    this.updateGraph();
  }

  ngOnInit() {
    this.prepareGraphData();
    this.initSvg();
    this.updateGraph();
    this.drawLegend();
  }

  @HostListener('window:resize', ['$event'])
  onResize() {
    let availWidth: number;

    if (window.innerWidth > screen.width) {
      availWidth = screen.width;
    } else {
      availWidth = window.innerWidth;
    }

    if (availWidth > 1000) {
      this.width = 960;
    } else {
      this.width = availWidth - 60;
    }

    this.height = screen.height - 200;

    d3.select<SVGElement, NetworkGraph>(this.graph.nativeElement)
      .select('svg')
      .attr('width', this.width)
      .attr('height', this.height);

    this.svg.selectAll('.legend').remove().exit();
    this.drawLegend();
    const translation = `translate(${(this.width - this.initialWidth) / 2},${(this.height - this.initialHeight) / 2})`;
    this.svg.selectAll('.nodes').attr('transform', translation);
    this.svg.selectAll('.links').attr('transform', translation);
  }

  private prepareGraphData() {
    this.graphData.nodes = [];
    this.graphData.links = [];

    this.data.nodes.forEach(value => {
      const node: SimulationNode = {
        id: value.id,
        openChannels: value.openChannels,
        tokenAddress: value.tokenAddress
      };

      this.graphData.nodes.push(node);
    });

    this.data.links.forEach(value => {
      const matchSource = simNode => simNode.id === value.sourceAddress && simNode.tokenAddress === value.tokenAddress;
      const matchTarget = simNode => simNode.id === value.targetAddress && simNode.tokenAddress === value.tokenAddress;

      const link: SimulationLink = {
        source: this.graphData.nodes.find(matchSource),
        target: this.graphData.nodes.find(matchTarget),
        sourceAddress: value.sourceAddress,
        targetAddress: value.targetAddress,
        status: value.status,
        tokenAddress: value.tokenAddress,
      };

      this.graphData.links.push(link);
    });
  }

  private updateGraph() {
    this.updateCircleCalculation();
    this.drawGraph();
    this.initialized = true;
  }

  private updateCircleCalculation() {
    const nodes = this.graphData.nodes;
    nodes.sort((a, b) => a.openChannels - b.openChannels);
    const oldRange = (nodes[nodes.length - 1].openChannels - 1);
    this.circleSize = (value: number) => (((value - 1) * 3) / oldRange) + 5;
  }

  private initSvg() {
    const availHeight = window.innerHeight;
    const availWidth = window.innerWidth;

    if (availWidth > 1000) {
      this.width = 960;
    } else {
      this.width = availWidth - 60;
    }

    if (availHeight < 1000) {
      this.height = availHeight - 100;
    } else {
      this.height = 900;
    }

    this.initialWidth = this.width;
    this.initialHeight = this.height;

    this.svg = d3.select<SVGElement, NetworkGraph>(this.graph.nativeElement)
      .append('svg')
      .attr('width', this.width)
      .attr('height', this.height);

    this.svg.on('click', () => this.clearSelection());

    this.link = this.svg.append('g')
      .attr('class', 'links')
      .selectAll('.link');

    this.node = this.svg.append('g')
      .attr('class', 'nodes')
      .attr('stroke-width', '1')
      .attr('stroke', '#fff')
      .selectAll('.node');

    this.color = d3Scale.scaleOrdinal()
      .domain(['opened', 'closed', 'settled'])
      .range(['#089000', '#E50000', '#8e24aa']);
  }

  private drawGraph() {
    this.simulation = d3.forceSimulation<SimulationNode, SimulationLink>()
      .force('link', d3.forceLink().id((node1: SimulationNode) => node1.id + node1.tokenAddress))
      .force('charge', d3.forceManyBody().distanceMax(180))
      .force('center', d3.forceCenter(this.width / 2, this.height / 2))
      .stop();

    const links = this.link.data(this.graphData.links, NetworkGraphComponent.linkCompare());

    this.svg.selectAll('.link').remove().exit();

    const link = links
      .enter()
      .append('line')
      .attr('class', 'link')
      .attr('stroke-opacity', 0.4)
      .attr('stroke-width', '2')
      .attr('stroke', datum => this.color(datum.status))
      .merge(links);

    const nodes = this.node.data(this.graphData.nodes, NetworkGraphComponent.nodeCompare());

    this.svg.selectAll('.node').remove().exit();

    const node = nodes
      .enter()
      .append('circle')
      .attr('class', 'node')
      .attr('fill', NetworkGraphComponent.NORMAL_COLOR)
      .attr('r', datum => this.circleSize(datum.openChannels))
      .call(d3.drag<any, any, any>()
        .on('start', datum => this.dragstarted(datum, this.simulation))
        .on('drag', this.dragged)
        .on('end', datum => this.dragended(datum, this.simulation)))
      .merge(nodes);

    node.append('title').text(d => d.id);
    node.on('click', datum => {
      d3.event.stopPropagation();
      return this.selectNode(datum);
    });

    this.simulation.nodes(this.graphData.nodes).on('tick', ticked);

    // @ts-ignore
    this.simulation.force('link').links(this.graphData.links);

    if (this.initialized) {
      for (let i = 0; i < 300; ++i) {
        this.simulation.tick();
      }
      ticked();
    } else {
      this.simulation.alpha(1).restart();
      this.initialized = true;
    }

    function ticked() {
      link
        .attr('x1', d => (d.source as SimulationNode).x)
        .attr('y1', d => (d.source as SimulationNode).y)
        .attr('x2', d => (d.target as SimulationNode).x)
        .attr('y2', d => (d.target as SimulationNode).y);

      node
        .attr('cx', d => d.x)
        .attr('cy', d => d.y);
    }
  }

  private drawLegend() {
    const legendRectSize = 12;
    const legendSpacing = 7;
    const legendHeight = legendRectSize + legendSpacing;
    const legend = this.svg.selectAll('.legend')
      .data(this.color.domain())
      .enter()
      .append('g')
      .classed('legend', true)
      .attr('transform', (d, i) => `translate(${this.width - 100},${(i * legendHeight) + 20})`);

    legend.append('rect')
      .attr('width', legendRectSize)
      .attr('height', legendRectSize / 5)
      .style('fill', this.color)
      .style('stroke', this.color);

    legend.append('text')
      .attr('x', 20)
      .attr('y', 5)
      .text((d: string) => d)
      .style('fill', '#000')
      .style('font-size', '12px');
  }

  private clearSelection() {
    this.svg.selectAll('.node')
      .attr('fill', NetworkGraphComponent.NORMAL_COLOR)
      .attr('opacity', 1);
    this.svg.selectAll('.link')
      .attr('stroke-opacity', NetworkGraphComponent.NODE_OPACITY)
      .attr('z-index', 1);
  }

  private selectNode(selectedNode: Node) {
    const neighbors: Node[] = this.getNeighbors(selectedNode);
    this.svg.selectAll('.node')
      .attr('fill', (node: Node) => this.ifNodeElse(selectedNode, node, neighbors, [
        NetworkGraphComponent.SELECTED_COLOR,
        NetworkGraphComponent.HIGHLIGHT_COLOR,
        NetworkGraphComponent.NORMAL_COLOR
      ]))
      .attr('opacity', (node: Node) => {
        return this.ifNodeElse(selectedNode, node, neighbors, [
          1,
          1,
          0.6
        ]);
      });
    this.svg.selectAll('.link')
      .attr('stroke-opacity', (link: Link) => this.ifNeighborElse(selectedNode, link, [
        2, NetworkGraphComponent.NODE_OPACITY
      ]))
      .attr('z-index', (link: Link) => this.ifNeighborElse(selectedNode, link, [10, 1]))
      .attr('stroke-width', (link: Link) => this.ifNeighborElse(selectedNode, link, [3, 2]));
  }

  private getNeighbors(node: Node): Node[] {
    return this.graphData.links
      .reduce((neighbors, link) => {
        if (link.targetAddress === node.id && link.tokenAddress === node.tokenAddress) {
          neighbors.push(link.source);
        } else if (link.sourceAddress === node.id && link.tokenAddress === node.tokenAddress) {
          neighbors.push(link.target);
        }
        return neighbors;
      }, []);
  }

  // noinspection JSMethodCanBeStatic
  private isNeighbor(node: Node, link: Link): boolean {
    const sameNetwork = node.tokenAddress === link.tokenAddress;
    const sourceMatches = sameNetwork && node.id === link.sourceAddress;
    const targetMatches = sameNetwork && node.id === link.targetAddress;
    return sourceMatches || targetMatches;
  }

  private ifNeighborElse<T>(node: Node, link: Link, tuple: [T, T]): T {
    if (this.isNeighbor(node, link)) {
      return tuple[0];
    } else {
      return tuple[1];
    }
  }

  private ifNodeElse<T>(selectedNode: Node, node: Node, neighbors: Node[], states: [T, T, T]): T {
    if (node === selectedNode) {
      return states[0];
    } else if (this.nodeInNeighbors(node, neighbors)) {
      return states[1];
    } else {
      return states[2];
    }
  }

  private nodeInNeighbors(node: Node, neighbors: Node[]) {
    return neighbors.find(current => this.isSameNode(node, current));
  }

  // noinspection JSMethodCanBeStatic
  private isSameNode(node1: Node, node2: Node): boolean {
    return node1.tokenAddress === node2.tokenAddress && node1.id === node2.id;
  }

  //noinspection JSMethodCanBeStatic
  private dragstarted(node: SimulationNode, simulation: Simulation<SimulationNode, SimulationLink>) {
    if (!d3.event.active) {
      simulation.alphaTarget(0.3).restart();
    }
    node.fx = node.x;
    node.fy = node.y;
  }

  //noinspection JSMethodCanBeStatic
  private dragged(node: SimulationNode) {
    node.fx = d3.event.x;
    node.fy = d3.event.y;
  }

  //noinspection JSMethodCanBeStatic
  private dragended(node: SimulationNode, simulation: Simulation<SimulationNode, SimulationLink>) {
    if (!d3.event.active) {
      simulation.alphaTarget(0);
    }
    node.fx = null;
    node.fy = null;
  }
}
