/**
 * @param map
 * @param url 
 * @param params 
 * @param adminGSVLabelView 
 * @param mapData 
 */
function InitializeSubmittedLabels(map, url, params, adminGSVLabelView, mapData) {
    $.getJSON(url, function (data) {
        var auditedStreetColor = params.streetColor;
        // Count a number of each label type
        var labelCounter = {
            "CurbRamp": 0,
            "NoCurbRamp": 0,
            "Obstacle": 0,
            "SurfaceProblem": 0,
            "NoSidewalk": 0
        };
        for (var i = data.features.length - 1; i >= 0; i--) {
            labelCounter[data.features[i].properties.label_type] += 1;
        }
        document.getElementById("map-legend-curb-ramp").innerHTML = "<svg width='20' height='20'><circle r='6' cx='10' cy='10' fill='" + colorMapping['CurbRamp'].fillStyle + "'></svg>";
        document.getElementById("map-legend-no-curb-ramp").innerHTML = "<svg width='20' height='20'><circle r='6' cx='10' cy='10' fill='" + colorMapping['NoCurbRamp'].fillStyle + "'></svg>";
        document.getElementById("map-legend-obstacle").innerHTML = "<svg width='20' height='20'><circle r='6' cx='10' cy='10' fill='" + colorMapping['Obstacle'].fillStyle + "'></svg>";
        document.getElementById("map-legend-surface-problem").innerHTML = "<svg width='20' height='20'><circle r='6' cx='10' cy='10' fill='" + colorMapping['SurfaceProblem'].fillStyle + "'></svg>";
        document.getElementById("map-legend-no-sidewalk").innerHTML = "<svg width='20' height='20'><circle r='6' cx='10' cy='10' fill='" + colorMapping['NoSidewalk'].fillStyle + "' stroke='" + colorMapping['NoSidewalk'].strokeStyle + "'></svg>";
        document.getElementById("map-legend-audited-street").innerHTML = "<svg width='20' height='20'><path stroke='" + auditedStreetColor + "' stroke-width='3' d='M 2 10 L 18 10 z'></svg>";
        if (params.isUserDash) {
            document.getElementById("td-number-of-curb-ramps").innerHTML = labelCounter["CurbRamp"];
            document.getElementById("td-number-of-missing-curb-ramps").innerHTML = labelCounter["NoCurbRamp"];
            document.getElementById("td-number-of-obstacles").innerHTML = labelCounter["Obstacle"];
            document.getElementById("td-number-of-surface-problems").innerHTML = labelCounter["SurfaceProblem"];
            document.getElementById("td-number-of-no-sidewalks").innerHTML = labelCounter["NoSidewalk"];
            createLayer(data).addTo(map);
            if (params.choroplethType === 'userDash') {
                setRegionFocus(map);
            }  
        } else {    // When loading label map.
            document.getElementById("map-legend-other").innerHTML = "<svg width='20' height='20'><circle r='6' cx='10' cy='10' fill='" + colorMapping['Other'].fillStyle + "' stroke='" + colorMapping['Other'].strokeStyle + "'></svg>";
            document.getElementById("map-legend-occlusion").innerHTML = "<svg width='20' height='20'><circle r='6' cx='10' cy='10' fill='" + colorMapping['Other'].fillStyle + "' stroke='" + colorMapping['Occlusion'].strokeStyle + "'></svg>";
             // Create layers for each of the 42 different label-severity combinations
            for (var i = 0; i < data.features.length; i++) {
                var labelType = data.features[i].properties.label_type;
                if (data.features[i].properties.severity === 1) {
                    mapData.allLayers[labelType][1].push(data.features[i]);
                } else if (data.features[i].properties.severity === 2) {
                    mapData.allLayers[labelType][2].push(data.features[i]);
                } else if (data.features[i].properties.severity === 3) {
                    mapData.allLayers[labelType][3].push(data.features[i]);
                } else if (data.features[i].properties.severity === 4) {
                    mapData.allLayers[labelType][4].push(data.features[i]);
                } else if (data.features[i].properties.severity === 5) {
                    mapData.allLayers[labelType][5].push(data.features[i]);
                } else { // No severity level
                    mapData.allLayers[labelType][0].push(data.features[i]);
                }
            }
            Object.keys(mapData.allLayers).forEach(function (key) {
                for (var i = 0; i < mapData.allLayers[key].length; i++) {
                    mapData.allLayers[key][i] = createLayer({
                        "type": "FeatureCollection",
                        "features": mapData.allLayers[key][i]
                    });
                    mapData.allLayers[key][i].addTo(map);
                }
            })
        } 
    });

    function onEachLabelFeature(feature, layer) {
        if (params.labelPopup) {
            layer.on('click', function () {
                adminGSVLabelView.showLabel(feature.properties.label_id);
            });
            layer.on({
                'mouseover': function () {
                    layer.setRadius(15);
                },
                'mouseout': function () {
                    layer.setRadius(5);
                }
            })
        } else {    // When on user dash.
            if (feature.properties && feature.properties.type) {
                layer.bindPopup(feature.properties.type);
            }
        }
        
    }

    var colorMapping = util.misc.getLabelColors();
    var geojsonMarkerOptions = {
            radius: 5,
            fillColor: "#ff7800",
            color: "#ffffff",
            weight: 1,
            opacity: 0.5,
            fillOpacity: 0.5,
            "stroke-width": 1
        };

    function createLayer(data) {
        return L.geoJson(data, {
            pointToLayer: function (feature, latlng) {
                var style = $.extend(true, {}, geojsonMarkerOptions);
                style.fillColor = colorMapping[feature.properties.label_type].fillStyle;
                if (params.choroplethType === 'labelMap') {
                    style.color = colorMapping[feature.properties.label_type].strokeStyle;
                }
                return L.circleMarker(latlng, style);
            },
            onEachFeature: onEachLabelFeature
        })
    }

    function setRegionFocus(map) {
        // Search for a region id in the query string. If you find one, focus on that region.
        var regionId = util.getURLParameter("regionId"),
        i,
        len;
        if (regionId && layers) {
            len = layers.length;
            for (i = 0; i < len; i++) {
                if ("feature" in layers[i] && "properties" in layers[i].feature && regionId == layers[i].feature.properties.region_id) {
                    var center = turf.center(layers[i].feature),
                        coordinates = center.geometry.coordinates,
                        latlng = L.latLng(coordinates[1], coordinates[0]),
                        zoom = map.getZoom();
                    zoom = zoom > 14 ? zoom : 14;

                    map.setView(latlng, zoom, {animate: true});
                    layers[i].setStyle({color: "red", fillColor: "red"});
                    currentLayer = layers[i];
                    break;
                }
            }
        }
    }
    return mapData;
}
