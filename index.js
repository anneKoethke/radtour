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
const lupeSrc = require("./res/img/lupe.png");

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

// supplements 'click' event for safari when touch screen
const eventType = getEventType();

/* ------------------ START: MAP MAKING ------------------ */

// CUSTOM MAP CONTROL: for biergarten search
// src: https://openlayers.org/en/latest/examples/custom-controls.html
const SearchControl = (function (Control) {

  function SearchControl(opt_options) {
    let options = opt_options || {}, 
      searchBtn = document.createElement('button'),
      lupe = document.createElement('img'),
      inputField = document.createElement('input'),
      parentEl = document.createElement('div');
    searchBtn.className = 'search-btn';
    searchBtn.id = 'searching';
    lupe.src = lupeSrc;
    lupe.className = 'lupe';
    searchBtn.appendChild(lupe);
    inputField.id = 'search-input';
    inputField.placeholder = "Biergarten suchen...";
    inputField.setAttribute('autocomplete', 'off');
    // put all elements into positin on map (via div with className 'ol-zoom-extent')
    parentEl.className = 'search-control ol-zoom-extent ol-unselectable ol-control';
    parentEl.appendChild(searchBtn);
    parentEl.appendChild(inputField);   
    // enhance Control function via .call() with this custom control (SearchControl)
    Control.call(this, {
      element: parentEl,
      target: options.target
    });
    // bind the searchData-function of SearchControl to the searchBtn (wouldn't work without '.bind()')
    searchBtn.addEventListener(eventType, this.searchData.bind(this), false);
  }
  // make sure, OL Control is imported, before adding SearchControl as custom Corntol to it
  if ( Control ) SearchControl.__proto__ = Control;
  SearchControl.prototype = Object.create( Control && Control.prototype );
  SearchControl.prototype.constructor = SearchControl;
  // the function: search the data via the input when the button is clicked
  SearchControl.prototype.searchData = function searchData () {
    let inp = document.querySelector('#search-input'), 
      // trim: remove whitespace from input (left and right end), 
      // split(',')[0] : get only the name part (not ', <Ort>'); split return a string array
      // lower case for easy comparison with marker's data name later
      currVal = (inp.value)? (((inp.value).trim()).split(','))[0].toLowerCase() : null;
    if (!currVal) {
      remindUserToTypeIntoInputField(inp);
    } else {
      // 'this' refers here to the map controls (the custom build controls)
      highlightMarkerAndCenterZoomMap(this, currVal);
      inp.value = "";
    }
    
    // help the user avoid mistakes and frustration
    function remindUserToTypeIntoInputField(inp) {
      inp.placeholder = "Suchbegriff hier eingeben";
      inp.style.borderColor = 'red';
      inp.addEventListener('focus', function(e) {
        inp.placeholder = "Biergarten suchen...";
        inp.style.borderColor = 'initial';
      }, false)
    }

    // so far handles just ONE result
    function highlightMarkerAndCenterZoomMap(mapControl, currVal) {
      for (let i = 0; i < data.length; i++) {
        let currName = (data[i].Name).toLowerCase(),
          currMarker = document.querySelector('#marker-'+data[i].id);
        removeHighlightFromMarker(currMarker, data[i].Distanz);
        if (currName === currVal) {
          highlightMarker(currMarker);
          centerAndZoomMapToMarker(mapControl, data[i].coords);
        }
      }
    }

    // no highlight for all markers unconcerned
    function removeHighlightFromMarker(currMarker, distance) {
      currMarker.style.backgroundColor = switchColorByDistance(distance);
      currMarker.style.border = "none";
    }

    // highlight the marker(s) found by search
    function highlightMarker(currMarker) {
      currMarker.style.backgroundColor = "orange";
      currMarker.style.border = "1px solid white";
    }

    // center map on the ONE found marker (by name search)
    function centerAndZoomMapToMarker(mapControl, coordinates) {
      mapControl.getMap().getView().setCenter(fromLonLat(coordinates));
      mapControl.getMap().getView().setZoom(mapOptions.searchZoom);
    }
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

// INITIAL map view
const mapView = new View({
    // OL5 + OSM >>> Web Mercator projection (EPSG:3857) 
    // != Google Maps GUI >>> EPSG:4326 == LonLat (or rather LatLon)
    center: fromLonLat(mapOptions.center),
    maxZoom: mapOptions.maximalZoom,
    minZoom: mapOptions.initialZoom,
    zoom: mapOptions.initialZoom,
    constrainRotation: 1 // constrains rotating the map on mobile (snaps back)
  })

// build the map 
const map = new Map({
  controls: defaultControls({ 
    attributionOptions: { 
      collapsible: true } 
    }).extend([
    new SearchControl() // custon control (see above)
  ]),
  interactions: defaultInteractions({ constrainResolution: true }),
  target: 'map',
  layers: [ mapTileLayer ],
  view: mapView
});

/* ------------------ END: MAP MAKING ------------------ */


/* ------------------ START: USER INTERACTION ------------------ */

// counters for switchColorByDistance
let count10 = 0,
    count30 = 0,
    count50 = 0,
    count75 = 0,
    countMore = 0;

/* AUTOCOMPLETE HANDLER */

// the (going to be) active element in the autocomplete dropdown list
let currFocus;
// Array of the Biergraten names for Search / Dropdown
const nameArray = getNameArray();
const input = document.querySelector('#search-input');
// user types a name into the Dropdown
input.addEventListener('input', handleDropdownListForAutocomplete);
input.addEventListener('keydown', handleKeyboardUseOnDropdown);

function handleDropdownListForAutocomplete() {
  let autocompleteList, highlighting, val = this.value;
  closeAllLists(); // close previous autocomplete lists
  // no input value? do nothing
  if (!val) return false; 
  // nothing is selected (nothign is active) yet
  currFocus = -1;
  //create the autocomplete list (dropdown with suggestions)
  autocompleteList = getAutocompleteList(this);
  // append list to parent of input (a div)
  this.parentNode.appendChild(autocompleteList);
  handleHighlighting(autocompleteList, highlighting, val);
}

function getAutocompleteList(that) {
  let a = document.createElement('div');
  a.setAttribute("id", that.id + "autocomplete-list");
  a.setAttribute("class", "autocomplete-items");
  return a;
}

// on input create a div for each elem in the nameArray and highlight the part already typed
function handleHighlighting(autocompleteList, highlighting, val) {
  for (let i = 0; i < nameArray.length; i++) {
    let curr = nameArray[i].toLowerCase();
    if (curr.search(val.toLowerCase()) > -1) {
      let num = curr.search(val.toLowerCase());
      highlighting = document.createElement('div');
      highlighting.innerHTML = nameArray[i].substr(0, num);
      highlighting.innerHTML += "<strong>" + nameArray[i].substr(num, val.length)+ "</strong>";
      highlighting.innerHTML += nameArray[i].substr(num + val.length);
      highlighting.innerHTML += "<input type='hidden' value='" + nameArray[i] + "'>";
      // click on item of autocomplete list to push it to input (required for SearchControl)
      highlighting.addEventListener(eventType, function(e) {
        input.value = this.getElementsByTagName("input")[0].value;
        let searchBtn = document.querySelector("#searching");
        searchBtn.click();
        closeAllLists();
      });
      autocompleteList.appendChild(highlighting);
    }
  }
}

// handling the use of arrow keys on the dropdown
function handleKeyboardUseOnDropdown(e) {
  // x is the htmlCollection representing the list
  let elementsList = document.getElementById(this.id + "autocomplete-list");
  if (elementsList) elementsList = elementsList.getElementsByTagName("div");
  // move up and down the selection  
  if (e.keyCode == 40) { // key DOWN
    currFocus++;
    addActive(elementsList);
  } else if (e.keyCode == 38) { // key UP
    currFocus--;
    addActive(elementsList);
  } else if (e.keyCode == 13) { // key ENTER
    e.preventDefault();
    if (currFocus > -1) {
      // simulate a click on the "active" item on ENTER
      if (elementsList) elementsList[currFocus].click();
    }
  }
}

// handling the 'active' attribute (CSS) for 
function addActive(list) {
  if (!list) return false;
  removeActive(list);
  if (currFocus >= list.length) currFocus = 0;
  if (currFocus < 0) currentFocus = (list.length - 1);
  list[currFocus].classList.add("autocomplete-active");
}

// removes active property from all elements in autocomplete list
function removeActive(list) {
  for (var i = 0; i < list.length; i++) {
    list[i].classList.remove("autocomplete-active");
  }
}

// close all autocomplete lists in the document,except the one passed as an argument
function closeAllLists(elmnt) {
  let list = document.getElementsByClassName("autocomplete-items");
  for (var i = 0; i < list.length; i++) {
    if (elmnt != list[i] && elmnt != input) {
      list[i].parentNode.removeChild(list[i]);
    }
  }
}

// close autocomplete list when clicking o the map
map.addEventListener(eventType, function (e) {
  closeAllLists(e.target);
});

function getNameArray() {
  let arr = [];
  for (let i = 0; i < data.length; i++) {
    arr.push(data[i].Name + ", " + data[i].Ort);
    //arr.push(data[i].Name);
  }
  return arr;
}

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

// removal of data - a bit of a brute force approach :) 
function hidePopup(currPopup) {
  let closeBtn = document.querySelector("#closeBtn");
  closeBtn.addEventListener(eventType, function () {
    currPopup.innerHTML = "";
  }, false);
}

// only when there is contact data to use, there will be a button to click
function hideBtnWhenNoLinkExists() {
  let popupLinkList = document.querySelectorAll(".popup-link");
  for(let i = 0; i < popupLinkList.length; i++) {
    if((popupLinkList[i].href == "mailto:") || (popupLinkList[i].href == "tel:") || (popupLinkList[i].href == "http://localhost:1234/") || (popupLinkList[i].href == "https://dig-red.mittelbayerische.de/OL/dist/")) {
      popupLinkList[i].parentNode.removeChild(popupLinkList[i]);
    }
  }
}

// data binding for the creation of the popups
function bindDataToMarker() {
  let re = /[0-9]+/,
    id = re.exec(this.id),
    currItem = data[(id-1)];
  createPopup(currItem);
}

/* ------------------ END: USER INTERACTION ------------------ */



/* ------------------ Start: MAP-MARKERS >>> drawMarkers() ------------------ */

// parking lot for the markers (when they are created, before they can be layed over the map by their coords)
const markerContainer = document.getElementById("hidden-div");

// the focal marker (Regensburg Hbf), from which the cycling distances are measured
function drawHbfMarker() {  
  const hbfMarker = new Overlay({
    position: fromLonLat(mapOptions.rgbg_hbf),
    positioning: 'center-center',
    element: document.getElementById('hbf-marker'),
    stopEvent: false
  });
  map.addOverlay(hbfMarker);
}

// foreach point in the data make a marker div and lay it over the map
function drawDataMarkers() {
  for (let i = 0; i < data.length; i++) {
    if (data[i].coords[0] != 0) { // only use data with existing coordinates
      let currMarkerDiv = getCurrentMarkerDiv(data[i], i+1);
      currMarkerDiv.addEventListener(eventType, bindDataToMarker, false)
      markerContainer.appendChild(currMarkerDiv); // marker divs in #hidden-div
      let currMarker = getCurrentMarkerOverlay(data[i], i+1);
      map.addOverlay(currMarker);
    }
  }
}

// make a marker Div for the current data point 
function getCurrentMarkerDiv(item, k) { // k = i+1 from calling function
  let currentDiv = document.createElement("div");
  currentDiv.className = "marker";
  currentDiv.id = "marker-"+k;
  currentDiv.style.backgroundColor = switchColorByDistance(item.Distanz);
  return currentDiv;
}

// positioning of the marker on the map
function getCurrentMarkerOverlay(item, k) { // k = i+1 from calling function
  let currentMarkerOverlay = new Overlay({
    position: fromLonLat(item.coords),
    positioning: 'center-center',
    element: document.getElementById('marker-'+k),
    stopEvent: false
  });
  return currentMarkerOverlay;
}

// color codes for distance to Regensburg Hbf as preattentive visual cue
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

// end of map movement after zoom
function mapMoveEndHandler() {
  let currZoom = map.getView().getZoom(),
    markerList = document.getElementsByClassName("marker"); 
  for (let i = 0; i < markerList.length; i++) {
    switchSizeOnZoomLevel(currZoom, markerList[i]);
  }
}

// change the size of the markers for mobile friendly use (zoom in expands the markers for touch, zoom out shrinks them back for better oversight)
function switchSizeOnZoomLevel(currZoom, marker) {
  switch (currZoom) {
      case 8:
      case 9: 
        marker.style.width = "8px";  
        marker.style.height = "8px";   
        break;
      case 10:
      case 11:
        marker.style.width = "10px";  
        marker.style.height = "10px";   
        break;
      case 12:
        marker.style.width = "15px";  
        marker.style.height = "15px"; 
        break;
      case 13:
        marker.style.width = "20px";  
        marker.style.height = "20px"; 
        break;
      case 14:
        marker.style.width = "25px";  
        marker.style.height = "25px";
        break;
      default:
        break;
    }
}

// after map making >>> draw the markers via data
const drawMarkers = (function () {
  drawHbfMarker();
  drawDataMarkers();
})();

/* ------------------ END: MAP MARKERS ------------------ */

// marker visualization according to zoom level (moveend == zoom event haopend and stopped now)
map.on("moveend", mapMoveEndHandler);