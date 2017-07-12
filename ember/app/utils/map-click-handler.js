/* globals $ */

import ol from 'openlayers';

/**
 * @constructor
 * @param {ol.Map} map Openlayers map instance
 * @param {slFlightDisplay} flight_display Flight display module
 * @param {Object} settings Settings for this module
 */
export default function slMapClickHandler(map, flight_display, settings) {
  let map_click_handler = {};

  // Private attributes

  /**
   * The OpenLayers.Geometry object of the circle.
   * @type {Object}
   */
  let circle = { geometry: null, animation: null };

  /**
   * Stores the state if the infobox.
   * @type {Boolean}
   */
  let visible = false;


  let infobox = null;

  // Public attributes and functions

  /**
   * Click handler which shows a info box at the click location.
   *
   * @this {ol.Map}
   * @param {Event} e
   * @return {(boolean|undefined)}
   */
  map_click_handler.trigger = function(e) {
    // Hide infobox if it's currently visible
    if (visible) {
      e.map.removeOverlay(infobox);
      hideCircle(0);
      visible = false;
      infobox = null;
      return;
    }

    if (!infobox) {
      infobox = new ol.Overlay({
        element: $("<div id='MapInfoBox' class='InfoBox'></div>").get(0),
      });
    }

    let infobox_element = $(infobox.getElement());
    let coordinate = e.coordinate;

    if (settings['flight_info'] && flight_display) {
      let flight_path_source = flight_display.get('flights.source');
      let closest_feature = flight_path_source
          .getClosestFeatureToCoordinate(coordinate);

      if (closest_feature !== null) {
        let geometry = closest_feature.getGeometry();
        let closest_point = geometry.getClosestPoint(coordinate);

        let feature_pixel = e.map.getPixelFromCoordinate(closest_point);
        let mouse_pixel = e.map.getPixelFromCoordinate(coordinate);

        let squared_distance = Math.pow(mouse_pixel[0] - feature_pixel[0], 2) +
                               Math.pow(mouse_pixel[1] - feature_pixel[1], 2);

        if (squared_distance < 100) {
          let time = closest_point[3];
          let sfid = closest_feature.get('sfid');
          let flight = flight_display.get('flights').findBy('id', sfid);

          // flight info
          let flight_info = flightInfo(flight);
          infobox_element.append(flight_info);

          // near flights link
          let loc = ol.proj.transform(closest_point,
                                      'EPSG:3857',
                                      'EPSG:4326');
          let get_near_flights = nearFlights(loc[0], loc[1], time, flight);
          infobox_element.append(get_near_flights);

          coordinate = closest_point;
        }
      }
    }

    if (settings['location_info']) {
      // location info
      let loc = ol.proj.transform(coordinate, 'EPSG:3857', 'EPSG:4326');
      let get_location_info = locationInfo(loc[0], loc[1]);
      infobox_element.append(get_location_info);
    }

    e.map.addOverlay(infobox);
    infobox.setPosition(coordinate);
    showCircle(coordinate);

    visible = true;

    return false; // stop bubbeling
  };

  map_click_handler.init = function() {
    map.on('click', map_click_handler.trigger);
  };

  map_click_handler.init();
  return map_click_handler;

  // Private functions

  /**
   * Returns the flight badge element
   * @param {slFlight} flight Flight object
   * @return {jQuery}
   */
  function flightInfo(flight) {
    return $(`<span class="info-item badge" style="background:${flight.get('color')}">
      ${flight.getWithDefault('registration', '')}
    </span>`);
  }

  function nearFlights(lon, lat, time, flight) {
    let get_near_flights = $(
        '<div class="info-item">' +
        '<a class="near" href="#NearFlights">Load nearby flights</a>' +
        '</div>'
        );

    get_near_flights.on('click touchend', function(e) {
      map.removeOverlay(infobox);
      getNearFlights(lon, lat, time, flight);
      visible = false;
      infobox = null;
      e.preventDefault();
    });

    return get_near_flights;
  }

  function locationInfo(lon, lat) {
    let get_location_info = $(
        '<div class="info-item">' +
        '<a class="near" href="#LocationInfo">Get location info</a>' +
        '</div>'
        );

    get_location_info.on('click touchend', function(e) {
      getLocationInfo(lon, lat);
      e.preventDefault();
    });

    return get_location_info;
  }

  /**
   * Show a circle at the clicked position
   *
   * @param {Array<Number>} coordinate Coordinate
   */
  function showCircle(coordinate) {
    let stroke_style = new ol.style.Stroke({
      color: '#f4bd33',
      width: 3,
    });

    /*
    let fill_style = new ol.style.Fill({
      opacity: 0.5,
      color: '#f4bd00'
    });
    */

    if (!circle.geometry)
      circle.geometry = new ol.geom.Circle(coordinate, 1000);
    else
      circle.geometry.setCenterAndRadius(coordinate, 1000);

    circle.animation = null;

    map.on('postcompose', function(e) {
      let vector_context = e.vectorContext;

      if (circle.geometry) {
        if (circle.animation != null) {
          let frame_state = e.frameState;
          if (!circle.animation.start)
            circle.animation.start = frame_state.time;

          if (circle.animation.duration <= 0 ||
              frame_state.time >
              circle.animation.start + circle.animation.duration) {
            circle.geometry = null;
            return;
          }

          let delta_time = -(circle.animation.start - frame_state.time) %
                           circle.animation.duration;
          stroke_style.setWidth(3 - delta_time /
                                (circle.animation.duration / 3));
        }

        vector_context.setFillStrokeStyle(null, stroke_style);
        vector_context.drawCircleGeometry(circle.geometry);
        map.render();
      }
    });
  }

  /**
   * Hides the search circle
   *
   * @param {Number} duration Fade duration in ms
   */
  function hideCircle(duration) {
    circle.animation = { duration: duration, start: null };
  }

  /**
   * Request near flights via ajax
   *
   * @param {Number} lon Longitude.
   * @param {Number} lat Latitude.
   * @param {Number} time Time.
   * @param {slFlight} flight Flight.
   */
  function getNearFlights(lon, lat, time, flight) {
    if (!flight_display) return;

    let req = $.ajax(`/flights/${flight.get('id')}/near?lon=${lon}&lat=${lat}&time=${time}`);

    req.done(function(data) {
      for (let i = 0; i < data['flights'].length; ++i) {
        let flight = data['flights'][i];

        // skip retrieved flight if already on map
        if (flight_display.get('flights').findBy('id', flight['sfid']))
          continue;

        window.fixCalcService.addFlight(flight);
      }
    });

    req.always(function() {
      hideCircle(1000);
    });
  }

  /**
   * Request location informations via ajax
   *
   * @param {Number} lon Longitude.
   * @param {Number} lat Latitude.
   */
  function getLocationInfo(lon, lat) {
    let req = $.ajax(`${settings.api_url}/mapitems?lon=${lon}&lat=${lat}`);

    req.done(function(data) {
      showLocationData(data);
    });

    req.fail(function() {
      showLocationData(null);
    });
  }

  /**
   * Show location data in infobox
   *
   * @param {Object} data Location data.
   */
  function showLocationData(data) {
    if (!visible) return; // do nothing if infobox is closed already

    let element = $(infobox.getElement());
    element.empty();
    let item = $('<div class="location info-item"></div>');
    let no_data = true;

    if (data) {
      let airspace_layer = map.getLayers().getArray().filter(function(e) {
        return e.get('name') == 'Airspace';
      })[0];
      let mwp_layer = map.getLayers().getArray().filter(function(e) {
        return e.get('name') == 'Mountain Wave Project';
      })[0];

      if (!$.isEmptyObject(data['airspaces']) &&
          airspace_layer.getVisible()) {
        let p = $('<p></p>');
        p.append(formatAirspaceData(data['airspaces']));
        item.append(p);
        no_data = false;
      }

      if (!$.isEmptyObject(data['waves']) &&
          mwp_layer.getVisible()) {
        let p = $('<p></p>');
        p.append(formatMountainWaveData(data['waves']));
        item.append(p);
        no_data = false;
      }
    }

    if (no_data) {
      item.html('No data retrieved for this location');

      element.delay(1500).fadeOut(1000, function() {
        map.removeOverlay(infobox);
        visible = false;
      });

      hideCircle(1000);
    }

    element.append(item);

    //infobox.setOffset([15, element.height() / 2]);
  }

  /**
   * Format Airspace data for infobox
   *
   * @param {Object} data Airspace data.
   * @return {jQuery} HTML table with the airspace data.
   */
  function formatAirspaceData(data) {
    let table = $('<table></table>');

    table.append($(`<thead>
      <tr>
        <th colspan="4">Airspaces</th>
      </tr>
      <tr>
        <th>Name</th>
        <th>Class</th>
        <th>Base</th>
        <th>Top</th>
      </tr>
    </thead>`));

    let table_body = $('<tbody></tbody>');

    for (let i = 0; i < data.length; ++i) {
      table_body.append($(`<tr>
        <td class="airspace_name">${data[i]['name']}</td>
        <td class="airspace_class">${data[i]['class']}</td>
        <td class="airspace_base">${data[i]['base']}</td>
        <td class="airspace_top">${data[i]['top']}</td>
      </tr>`));
    }

    table.append(table_body);

    return table;
  }

  /**
   * Format Mountain Wave data in infobox
   *
   * @param {Object} data Wave data.
   * @return {jQuery} HTML table with the wave data.
   */
  function formatMountainWaveData(data) {
    let table = $('<table></table>');

    table.append($(`<thead>
      <tr>
        <th colspan="2">Mountain Waves</th>
      </tr>
      <tr>
        <th>Name</th>
        <th>Wind direction</th>
      </tr>
    </thead>`));

    let table_body = $('<tbody></tbody>');

    for (let i = 0; i < data.length; ++i) {
      let wind_direction = data[i]['main_wind_direction'] || 'Unknown';

      table_body.append($(`<tr>
        <td class="wave_name">${data[i]['name']}</td>
        <td class="wave_direction">${wind_direction}</td>
      </tr>`));
    }

    table.append(table_body);

    return table;
  }
}
