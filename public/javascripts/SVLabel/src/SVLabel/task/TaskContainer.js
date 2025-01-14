/**
 * TaskContainer module.
 *
 * Todo. This module needs to be cleaned up.
 * Todo. Split the responsibilities. Storing tasks should remain here, but other things like fetching data from the server (should go to TaskModel) and rendering segments on a map.
 * @param turf
 * @returns {{className: string}}
 * @constructor
 * @memberof svl
 */
function TaskContainer (routeModel, navigationModel, neighborhoodModel, streetViewService, svl, taskModel, tracker) {
    var self = this;

    var previousTasks = [];
    var currentTask = null;
    var beforeJumpNewTask = null;
    var paths;
    var previousPaths = [];

    self._taskStoreByRegionId = {};
    self._taskStoreByRouteId = {};

    self._handleTaskFetchCompleted = function () {
        var nextTask = self.nextTask();
        self.initNextTask(nextTask);
    };

    self.getFinishedAndInitNextTask = function (finished, label) {
        if (label === undefined) label = 'mission';

        var newTask;
        if (label != 'onboarding') {
            newTask = self.nextTask(finished);
            if (!newTask) {
                var currentNeighborhood = svl.neighborhoodModel.currentNeighborhood();
                var currentNeighborhoodId = currentNeighborhood.getProperty("regionId");
                svl.neighborhoodModel.neighborhoodCompleted(currentNeighborhoodId);
            } else {
                svl.taskContainer.initNextTask(newTask);
            }
        } else {
            newTask = finished;
            svl.taskContainer.initNextTask(newTask);
        }
        return newTask;
    };

    self.initNextTask = function (nextTaskIn) {
        var geometry;
        var lat;
        var lng;

        var currentPosition = navigationModel.getPosition();
        nextTaskIn.setStreetEdgeDirection(currentPosition.lat, currentPosition.lng);

        geometry = nextTaskIn.getGeometry();
        lat = geometry.coordinates[0][1];
        lng = geometry.coordinates[0][0];

        var STREETVIEW_MAX_DISTANCE = 25;
        var latLng = new google.maps.LatLng(lat, lng);

        navigationModel.disableWalking();

        if (streetViewService) {
            streetViewService.getPanorama({location: latLng, radius: STREETVIEW_MAX_DISTANCE, source: google.maps.StreetViewSource.OUTDOOR},
                function (streetViewPanoramaData, status) {
                    navigationModel.enableWalking();
                    if (status === google.maps.StreetViewStatus.OK) {
                        lat = streetViewPanoramaData.location.latLng.lat();
                        lng = streetViewPanoramaData.location.latLng.lng();
                        self.setCurrentTask(nextTaskIn);
                        navigationModel.setPosition(lat, lng, function(){
                            navigationModel.preparePovReset();
                        });
                    } else {
                        console.error("Error loading Street View imagery");
                        svl.tracker.push("PanoId_NotFound", {'Location': JSON.stringify(latLng)});
                        nextTaskIn.complete();
                        // no street view available in this range.
                        self.getFinishedAndInitNextTask(nextTaskIn);
                    }
                });
        }
    };

    /**
     * End the current task.
     */
    self.endTask = function (task) {
        if (tracker) tracker.push("TaskEnd");

        task.complete();
        // Go through the tasks and mark the completed task as isCompleted=true

        /* Old Code: Dynamic task generation */
        var neighborhood = neighborhoodModel.currentNeighborhood();
        var neighborhoodTasks = self._taskStoreByRegionId[neighborhood.getProperty("regionId")];
        for (var i = 0, len = neighborhoodTasks.length;  i < len; i++) {
            if (task.getStreetEdgeId() == neighborhoodTasks[i].getStreetEdgeId()) {
                neighborhoodTasks[i].complete();
            }
        }

        /* New Code: Route based task generation */
        var route = routeModel.currentRoute();
        var currentRoute = route.getProperty("routeId");
        var routeTasks = self.getTasksOnRoute(currentRoute);
        var routeStreets = Object.keys(routeTasks);
        for (var j = 0, len1 = routeStreets.length;  j < len1; j++) {
            var streetId = routeStreets[j];
            var t = routeTasks[streetId]["task"];
            if (task.getStreetEdgeId() == t.getStreetEdgeId()) {
                t.complete();
                break;
            }
        }

        // Update the total distance across neighborhoods that the user has audited
        updateAuditedDistance("miles");

        /*
        // Commented out signin prompt for mturk
        if (!('user' in svl) || (svl.user.getProperty('username') == "anonymous" &&
            getCompletedTaskDistance(neighborhood.getProperty("regionId"), "kilometers") > 0.15 &&
            !svl.popUpMessage.haveAskedToSignIn())) {
            svl.popUpMessage.promptSignIn();
        }
        */

        // Submit the data.
        var data = svl.form.compileSubmissionData(task),
            staged = svl.storage.get("staged");

        if (staged.length > 0) {
            staged.push(data);
            svl.form.submit(staged, task);
            svl.storage.set("staged", []);  // Empty the staged data.
        } else {
            svl.form.submit(data, task);
        }


        pushATask(task); // Push the data into previousTasks

        // Clear the current paths
        var _geojson = task.getGeoJSON();
        var gCoordinates = _geojson.features[0].geometry.coordinates.map(function (coord) {
            return new google.maps.LatLng(coord[1], coord[0]);
        });
        previousPaths.push(new google.maps.Polyline({
            path: gCoordinates,
            geodesic: true,
            strokeColor: '#00ff00',
            strokeOpacity: 1.0,
            strokeWeight: 2
        }));
        paths = null;

        return task;
    };


    /**
     * Fetch a task based on the street id.
     * @param regionId
     * @param streetEdgeId
     * @param callback
     * @param async
     */
    function fetchATask(regionId, streetEdgeId, callback, async) {
        if (typeof async == "undefined") async = true;
        $.ajax({
            url: "/task/street/" + streetEdgeId,
            type: 'get',
            success: function (json) {
                var lat1 = json.features[0].geometry.coordinates[0][1],
                    lng1 = json.features[0].geometry.coordinates[0][0],
                    newTask = svl.taskFactory.create(json, lat1, lng1);
                if (json.features[0].properties.completed) newTask.complete();
                storeTask(regionId, newTask);
                if (callback) callback();
            },
            error: function (result) {
                throw result;
            }
        });
    }

    /**
     * Request the server to populate tasks
     * Todo. Move this to somewhere else. TaskModel?
     * @param regionId {number} Region id
     * @param callback A callback function
     * @param async {boolean}
     */
    self.fetchTasksInARegion = function (regionId, callback, async) {
        if (typeof async == "undefined") async = true;

        if (typeof regionId == "number") {
            $.ajax({
                url: "/tasks?regionId=" + regionId,
                async: async,
                type: 'get',
                success: function (result) {
                    var task;
                    for (var i = 0; i < result.length; i++) {
                        result[i].features[0].properties.assignment_id = svl.amtAssignmentId;
                        task = svl.taskFactory.create(result[i]);
                        if ((result[i].features[0].properties.completed)) task.complete();
                        storeTask(regionId, task);
                    }

                    if (callback) callback();
                },
                error: function (result) {
                    console.error(result);
                }
            });
        } else {
            console.error("regionId should be an integer value");
        }
    };

    /**
     * Request the server to populate tasks for a route
     *
     * @param routeId {number} Route id
     * @param callback A callback function
     * @param async {boolean}
     */
    self.fetchTasksOnARoute = function (routeId, callback, async) {
        if (typeof async == "undefined") async = true;

        if (typeof routeId == "number") {
            $.ajax({
                url: "/routes/" + routeId,
                async: async,
                type: 'get',
                success: function (result) {
                    var keys = Object.keys(result);
                    for (var key_i = 0; key_i < keys.length; key_i++) {
                        var streetId = keys[key_i];
                        var routeRecord = result[streetId];
                        routeRecord["task"].features[0].properties.assignment_id = svl.amtAssignmentId;
                        var task = svl.taskFactory.create(routeRecord["task"]);
                        if ((routeRecord["task"].features[0].properties.completed)) task.complete();
                        routeRecord["task"] = task;
                        storeRouteTask(routeId, streetId, routeRecord);
                    }

                    if (callback) callback();
                },
                error: function (result) {
                    console.error(result);
                }
            });
        } else {
            console.error("routeId should be an integer value");
        }
    };



    /**
     * Find tasks (i.e., street edges) in the region that are connected to the given task.
     * @param regionId {number} Region id
     * @param taskIn {object} Task
     * @param threshold {number} Distance threshold
     * @param unit {string} Distance unit
     * @returns {Array}
     */
    self._findConnectedTask = function (regionId, taskIn, threshold, unit) {
        var tasks = self.getTasksInRegion(regionId);

        if (tasks) {
            var connectedTasks = [];
            if (!threshold) threshold = 0.01;  // 0.01 km.
            if (!unit) unit = "kilometers";
            tasks = tasks.filter(function (t) { return !t.isCompleted(); });

            if (taskIn) {
                tasks = tasks.filter(function (t) { return t.getStreetEdgeId() != taskIn.getStreetEdgeId(); });

                for (var i = 0, len = tasks.length; i < len; i++) {
                    if (taskIn.isConnectedTo(tasks[i], threshold, unit)) {
                        connectedTasks.push(tasks[i]);
                    }
                }
                return connectedTasks;
            } else {
                return util.shuffle(tasks);
            }
        } else {
            return [];
        }
    };

    /**
     * Get the total distance of completed segments
     * @params {unit} String can be degrees, radians, miles, or kilometers
     * @returns {number} distance in meters
     */
    function getCompletedTaskDistance (regionId, unit) {
        if (!unit) unit = "kilometers";

        var completedTasks = getCompletedTasks(regionId),
            geojson,
            feature,
            distance = 0;

        if (completedTasks) {
            for (var i = 0, len = completedTasks.length; i < len; i++) {
                geojson = completedTasks[i].getGeoJSON();
                feature = geojson.features[0];
                distance += turf.lineDistance(feature, unit);
            }
        }

        distance += getCurrentTaskDistance(unit);

        return distance;
    }

    function getCurrentTaskDistance(unit) {
        if (!unit) unit = "kilometers";

        if (currentTask) {
            var currentLatLng = navigationModel.getPosition();
            currentTask.updateTheFurthestPointReached(currentLatLng.lat, currentLatLng.lng);
            var currentTaskDistance = currentTask.getAuditedDistance(unit);
            return currentTaskDistance;
        }
        return 0;
    }

    /**
     * This method returns the completed tasks in the given region
     * @param regionId
     * @returns {Array}
     */
    function getCompletedTasks (regionId) {
        if (!(regionId in self._taskStoreByRegionId)) {
            console.error("getCompletedTasks needs regionId");
            return null;
        }
        if (!Array.isArray(self._taskStoreByRegionId[regionId])) {
            console.error("_taskStoreByRegionId[regionId] is not an array. Probably the data from this region is not loaded yet.");
            return null;
        }
        return self._taskStoreByRegionId[regionId].filter(function (task) {
            return task.isCompleted();
        });
    }

    /**
     * Get the current task
     * @returns {*}
     */
    function getCurrentTask () {
        return currentTask;
    }

    /**
     * Get the before jump task
     * @returns {*}
     */
    function getBeforeJumpTask () {
        return beforeJumpNewTask;
    }

    self.getIncompleteTaskDistance = function (regionId, unit) {
        var incompleteTasks = self.getIncompleteTasks(regionId);
        var taskDistances = incompleteTasks.map(function (task) { return task.lineDistance(unit); });
        return taskDistances.reduce(function (a, b) { return a + b; }, 0);
    };

    self.getIncompleteTasks = function (regionId) {
        if (!regionId && regionId !== 0) {
            console.error("regionId is not specified")
        }
        if (!(regionId in self._taskStoreByRegionId)) {
            self.fetchTasksInARegion(regionId, null, false);
            // console.error("regionId is not in _taskStoreByRegionId. This is probably because " +
            //    "you have not fetched the tasks in the region yet (e.g., by fetchTasksInARegion)");
            // return null;
        }
        if (!Array.isArray(self._taskStoreByRegionId[regionId])) {
            console.error("_taskStoreByRegionId[regionId] is not an array. " +
                "Probably the data from this region is not loaded yet.");
            return null;
        }
        return self._taskStoreByRegionId[regionId].filter(function (task) {
            return !task.isCompleted();
        });
    };

    this.getTasksInRegion = function (regionId) {
        return regionId in self._taskStoreByRegionId ? self._taskStoreByRegionId[regionId] : null;
    };

    this.getTasksOnRoute = function (routeId) {
        return routeId in self._taskStoreByRouteId ? self._taskStoreByRouteId[routeId] : null;
    };

    /**
     * Check if the current task is the first task in this session
     * @returns {boolean}
     */
    function isFirstTask () {
        return length() == 0;
    }

    /**
     * Get the length of the previous tasks
     * @returns {*|Number}
     */
    function length () {
        return previousTasks.length;
    }

    /**
     * Get the next task and set it as a current task.
     * @param finishedTask The task that has been finished.
     * @returns {*} Next task
     */
    this.nextTask = function (finishedTask) {
        var newTask;

        /*
        // OLD CODE: for dynamic task creation

         var neighborhood = neighborhoodModel.currentNeighborhood();
         var currentNeighborhoodId = neighborhood.getProperty("regionId");

         // Seek the incomplete street edges (tasks) that are connected to the task that has been complted.
        // If there aren't any connected tasks that are incomplete, randomly select a task from
        // any of the incomplete tasks in the neighborhood. If that is empty, return null.
        var candidateTasks = self._findConnectedTask(currentNeighborhoodId, finishedTask, null, null);
        candidateTasks = candidateTasks.filter(function (t) { return !t.isCompleted(); });
        if (candidateTasks.length == 0) {
            candidateTasks = self.getIncompleteTasks(currentNeighborhoodId).filter(function(t) {
                return (t.getStreetEdgeId() != (finishedTask ? finishedTask.getStreetEdgeId(): null));
            });
            if (candidateTasks.length == 0) return null;
        }
        // Return the new task. Change the starting point of the new task accordingly.
        newTask = _.shuffle(candidateTasks)[0];
         */

        // NEW CODE: Retrieve task from the _taskStoreByRouteIds
        if (finishedTask) {
            var route = routeModel.currentRoute();
            var currentRouteId = route.getProperty("routeId");
            var routeTasks = this.getTasksOnRoute(currentRouteId);

            var finishedStreetId = finishedTask.getStreetEdgeId();

            var nextStreetId = routeTasks[finishedStreetId]["next"];
            if(nextStreetId != -1) {
                newTask = routeTasks[nextStreetId]["task"];

                if (finishedTask) {
                    var coordinate = finishedTask.getLastCoordinate();
                    newTask.setStreetEdgeDirection(coordinate.lat, coordinate.lng);
                }
            }
        }

        return newTask;
    };

    /**
     * Push a task to previousTasks
     * @param task
     */
    function pushATask (task) {
        if (previousTasks.indexOf(task) < 0) {
            previousTasks.push(task);
        }
    }

    /**
     * Pop a task at the end of previousTasks
     * @returns {*}
     */
    function pop () {
        return previousTasks.pop();
    }

    /**
     * Set the current task
     * @param task
     */
    this.setCurrentTask = function (task) {
        currentTask = task;
        if (tracker) tracker.push('TaskStart');

        if ('compass' in svl) {
            svl.compass.setTurnMessage();
            svl.compass.showMessage();
            if (!svl.map.getLabelBeforeJumpListenerStatus()) svl.compass.update();
        }

        if ('form' in svl){
            svl.form.submit(svl.form.compileSubmissionData(currentTask), currentTask);
        }
    };

    /**
     * Store the before jump new task
     * @param task
     */
    this.setBeforeJumpNewTask = function (task) {
        beforeJumpNewTask = task;
    };

    /**
     * Store a task into taskStoreByRegionId
     * @param regionId {number} Region id
     * @param task {object} Task object
     */
    function storeTask(regionId, task) {
        if (!(regionId in self._taskStoreByRegionId)) self._taskStoreByRegionId[regionId] = [];
        var streetEdgeIds = self._taskStoreByRegionId[regionId].map(function (task) {
            return task.getStreetEdgeId();
        });
        if (streetEdgeIds.indexOf(task.getStreetEdgeId()) < 0) self._taskStoreByRegionId[regionId].push(task);
    }

    /**
     *
     * Store a task into taskStoreByRouteId
     * @param routeId {number} Route id
     * @param streetId {number} Route Street Id
     * @param routeJson {json} Route street json
     */
    function storeRouteTask(routeId, streetId, routeJson) {
        if (!(routeId in self._taskStoreByRouteId)) self._taskStoreByRouteId[routeId] = {};
        if (!(streetId in self._taskStoreByRouteId[routeId])) self._taskStoreByRouteId[routeId][streetId] = {};
        self._taskStoreByRouteId[routeId][streetId] = routeJson;
    }

    /**
     *
     * @param regionId
     * @param unit
     */
    function totalLineDistanceInARegion(regionId, unit) {
        if (!unit) unit = "kilometers";
        var tasks = self.getTasksInRegion(regionId);

        if (tasks) {
            var distanceArray = tasks.map(function (t) { return t.lineDistance(unit); });
            return distanceArray.sum();
        } else {
            return null;
        }
    }

    /**
     * This method is called from Map.handlerPositionUpdate() to update the color of audited and unaudited street
     * segments on Google Maps.
     * Todo. This should be done somewhere else.
     */
    function update () {
        for (var i = 0, len = previousTasks.length; i < len; i++) {
            previousTasks[i].render();
        }

        var currentLatLng = navigationModel.getPosition();
        currentTask.updateTheFurthestPointReached(currentLatLng.lat, currentLatLng.lng);
        currentTask.render();
    }

    /**
     * Update the audited distance by combining the distance previously traveled and the distance the user traveled in
     * the current session.
     * Todo. Fix this. The function name should be clear that this updates the global distance rather than the distance
     * traveled in the current neighborhood.
     * @returns {updateAuditedDistance}
     */
    function updateAuditedDistance (unit) {
        if (!unit) unit = "kilometers";
        var distance = 0,
            sessionDistance = 0,
            neighborhood = svl.neighborhoodContainer.getCurrentNeighborhood();

        if (neighborhood) {
            sessionDistance = getCompletedTaskDistance(neighborhood.getProperty("regionId"), unit);
        }

        distance += sessionDistance;
        svl.statusFieldNeighborhood.setAuditedDistance(distance.toFixed(1));
        return this;
    }

    // self.endTask = endTask;
    self.fetchATask = fetchATask;
    self.getCompletedTasks = getCompletedTasks;
    self.getCurrentTaskDistance = getCurrentTaskDistance;
    self.getCompletedTaskDistance = getCompletedTaskDistance;
    self.getCurrentTask = getCurrentTask;
    self.getBeforeJumpNewTask = getBeforeJumpTask;
    self.isFirstTask = isFirstTask;
    self.length = length;
    // self.nextTask = getNextTask;
    self.push = pushATask;

    self.storeTask = storeTask;
    self.totalLineDistanceInARegion = totalLineDistanceInARegion;
    self.update = update;
    self.updateAuditedDistance = updateAuditedDistance;
}