import 'ol/ol.css';
import { Map, View, Feature } from 'ol';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from "ol/layer/Vector";
import OSM from 'ol/source/OSM';
import { fromLonLat, toLonLat } from 'ol/proj';
import Point from 'ol/geom/Point';
import Vector from 'ol/source/Vector';
import Overlay from 'ol/Overlay';
import Projection from 'ol/proj/Projection';
import { defaults as defaultControls, Control } from 'ol/control';
import { defaults as defaultInteractions } from 'ol/interaction.js';
import Stamen from 'ol/source/Stamen.js';

/* INITIAL STEPS */

// underscoreJS for templating of popups
const _ = require('underscore');
// DATA (old MZ Map data)
const data = require("./res/data/bier.json");
// GENERAL OPTION
const rgb_colors = require("./res/generalOptions/MZ_colors.json");
const mapOptions = require("./res/generalOptions/mapOptions.json");

/* ------------------ START: MAP MAKING ------------------ */

// TODO: define custom control: search button for biergärten
// könnte man eventuell auslagern?!
/*
var SearchControl = (function (Control) {

  function SearchControl(opt_options) {
    let options = opt_options || {};
    let searchBtn = document.createElement('button');
    searchBtn.innerHTML = 'Lupe';
    let inputField = document.createElement('input');
    let el = document.createElement('div');
    element.className = 'search-button ol-unselectable ol-control';
    element.appendChild(searchBtn);
    element.appendChild(inputField);

    Control.call(this, {
      element: element,
      target: options.target
    });

    searchBtn.addEventListener('click', this.searchData.bind(this), false);
  }
    
  if (Control) SearchControl.__proto__ = Control;
  SearchControl.prototype = Object.create( Control && Control.prototype );
  SearchControl.prototype.constructor = SearchControl;

  SearchControl.prototype.searchData = function searchData() {
      console.log("searching");
      // this.getMap().getView().setRotation(0);
  }
}(Control)); 
*/

var SearchControl = /*@__PURE__*/(function (Control) {
  function SearchControl(opt_options) {
    var options = opt_options || {};

    var button = document.createElement('button');
    button.innerHTML = 'L';

    var inputField = document.createElement('input');
    inputField.innerHTML = "search...";

    var element = document.createElement('div');
    element.className = 'search-control ol-zoom-extent ol-unselectable ol-control';
    element.appendChild(button);
    element.appendChild(inputField);

    Control.call(this, {
      element: element,
      target: options.target
    });

    button.addEventListener('click', this.handleRotateNorth.bind(this), false);
  }

  if ( Control ) SearchControl.__proto__ = Control;
  SearchControl.prototype = Object.create( Control && Control.prototype );
  SearchControl.prototype.constructor = SearchControl;

  SearchControl.prototype.handleRotateNorth = function handleRotateNorth () {
    this.getMap().getView().setRotation(0);
  };

  return SearchControl;
}(Control));


// STAMEN TileLayer
const mapTileLayer = new TileLayer({ 
  source: new Stamen({
    layer: 'terrain',
    attributions: 'Map tiles by <a href="http://stamen.com" target="_blank">Stamen Design</a>,' +
                  ' under <a href="http://creativecommons.org/licenses/by/3.0" target="_blank">CC BY 3.0</a>.'           
  }) 
});
// intial map view
const mapView = new View({
    // OL5 + OSM >>> Web Mercator projection (EPSG:3857) || Google Maps GUI >>> EPSG:4326 == LonLat (or rather LatLon)
    center: fromLonLat(mapOptions.center),
    maxZoom: mapOptions.maximalZoom,
    minZoom: mapOptions.initialZoom,
    zoom: mapOptions.initialZoom,
    constrainRotation: 1 // constrains rotating the map on mobile (snaps back)
  })
// build the map 
// TODO: expand controls here ->  controls: defaultControls().extend([ new myCustomControl() ]), ...
const map = new Map({
  controls: defaultControls({ 
    attributionOptions: { 
      collapsible: true } 
    }).extend([
    new SearchControl()
  ]),
  interactions: defaultInteractions({ constrainResolution: true }),
  target: 'map',
  layers: [ mapTileLayer ],
  view: mapView
});

// counters
let count10 = 0,
    count30 = 0,
    count50 = 0,
    count75 = 0,
    countMore = 0;

/* ------------------ END: MAP MAKING ------------------ */


/* ------------------ START: USER INTERACTION ------------------ */

// Safari click/touch Handler
function getEventType () {
  let eventType = "click";
  if(navigator.userAgent.match(/mobile/i)) {
    if(navigator.userAgent.match(/iPad|iPhone/i)) {
      eventType = "touchend";
    }
	}
  return eventType;
}
const eventType = getEventType();

// popup handler
function createPopup(item) {
  let templDiv = document.querySelector("#pop").innerHTML,
    newEntry = _.template(templDiv),
    popupContainer = document.querySelector("#popup-container"),
    entryNode = document.createElement("div");
  entryNode.innerHTML = newEntry(item); //data[id-1]
  popupContainer.innerHTML = "";
  popupContainer.appendChild(entryNode.children[0]);
  hidePopup(popupContainer);
  hideBtnWhenNoLinkExists();
}
function hidePopup(currPopup) {
  let closeBtn = document.querySelector("#closeBtn");
  closeBtn.addEventListener(eventType, function () {
    currPopup.innerHTML = "";
  });
}
function hideBtnWhenNoLinkExists() {
  let popupLinkList = document.querySelectorAll(".popup-link");
  for(let i = 0; i < popupLinkList.length; i++) {
    if((popupLinkList[i].href == "mailto:") || (popupLinkList[i].href == "tel:") || (popupLinkList[i].href == "http://localhost:1234/") || (popupLinkList[i].href == "https://dig-red.mittelbayerische.de/OL/dist/")) {
      popupLinkList[i].parentNode.removeChild(popupLinkList[i]);
    }
  }
}
function bindDataToMarker() {
  let re = /[0-9]+/,
    id = re.exec(this.id),
    currItem = data[(id-1)];
    
  createPopup(currItem);
}

/* ------------------ END: USER INTERACTION ------------------ */



/* ------------------ Start: MAP-MARKERS >>> drawMarkers() ------------------ */

const markerContainer = document.getElementById("hidden-div");

function drawHbfMarker() {  
  const hbfMarker = new Overlay({
    position: fromLonLat(mapOptions.rgbg_hbf),
    positioning: 'center-center',
    element: document.getElementById('hbf-marker'),
    stopEvent: false
  });
  map.addOverlay(hbfMarker);
}

function drawDataMarkers() {
  for (let i = 0; i < data.length; i++) {
    if (data[i].coords[0] != 0) { // only use data with existing coordinates
      let currMarkerDiv = getCurrentMarkerDiv(data[i], i+1);
      currMarkerDiv.addEventListener(eventType, bindDataToMarker)
      markerContainer.appendChild(currMarkerDiv); // marker divs in #hidden-div
      let currMarker = getCurrentMarkerOverlay(data[i], i+1);
      map.addOverlay(currMarker);
    }
  }
}
function getCurrentMarkerDiv(item, k) { // k = i+1 from calling function
  let currentDiv = document.createElement("div");
  currentDiv.className = "marker";
  currentDiv.id = "marker-"+k;
  currentDiv.style.backgroundColor = switchColorByDistance(item.Distanz);
  return currentDiv;
}
function getCurrentMarkerOverlay(item, k) { // k = i+1 from calling function
  let currentMarkerOverlay = new Overlay({
    position: fromLonLat(item.coords),
    positioning: 'center-center',
    element: document.getElementById('marker-'+k),
    stopEvent: false
  });
  return currentMarkerOverlay;
}
function switchColorByDistance(distance) {
  let color = rgb_colors.neudunkelblau;
  if(distance < 10) {
    color = rgb_colors.hellblau;
    count10++;
  } else if ((distance >= 10) && (distance < 30)) {
    color = rgb_colors.hellgrau;
    count30++;
  } else if ((distance >= 30) && (distance < 50)) {
    color = rgb_colors.mittelblau;
    count50++;
  } else if ((distance >= 50) && (distance < 75)) {
    color = rgb_colors.dunkelblau;
    count75++;
  } else {
    countMore++;
  }
  return color;
}
function mapMoveEndHandler() {
  let currZoom = map.getView().getZoom(),
    markerList = document.getElementsByClassName("marker"); 
  for (let i = 0; i < markerList.length; i++) {
    switch (currZoom) {
      case 8:
      case 9: 
        markerList[i].style.width = "8px";  
        markerList[i].style.height = "8px";   
        break;
      case 10:
      case 11:
        markerList[i].style.width = "10px";  
        markerList[i].style.height = "10px";   
        break;
      case 12:
        markerList[i].style.width = "15px";  
        markerList[i].style.height = "15px"; 
        break;
      case 13:
        markerList[i].style.width = "20px";  
        markerList[i].style.height = "20px"; 
        break;
      case 14:
        markerList[i].style.width = "25px";  
        markerList[i].style.height = "25px";
        break;
      default:
        break;
    }
  }
}

// after map making >>> draw the markers via data
const drawMarkers = (function () {
  drawHbfMarker();
  drawDataMarkers();
})();

/* ------------------ END: MAP MARKERS ------------------ */

// marker visualization according to zoom level 
map.on("moveend", mapMoveEndHandler);