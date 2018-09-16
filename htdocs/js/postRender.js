function modulePostRender() {
	var moduleId = parseInt(window.location.href.substring(window.location.href.lastIndexOf("/") + 1));
	if (!isNaN(moduleId)) {
		$.ajax("/ZAutomation/api/v1/instances/" + moduleId)
			.done(function(response) {
				if (typeof response.data.params.configuration.knownApps != 'undefined') {
					fillDropDown(response.data.params.configuration.knownApps, 
						response.data.params.configuration.apps);
				}
			});
	}
	$("div[data-alpaca-field-name='configuration_clientKey']").hide();
	$("div[data-alpaca-field-name='configuration_knownApps']").hide();
};

function fillDropDown(knownApps, selectedApps) {
	console.log("knownApps: " + JSON.stringify(knownApps) + ", selectedApps: " + JSON.stringify(selectedApps));
	var select = $("div[data-alpaca-field-name='configuration_apps']").find('select');
	console.log("select: " + select);
	knownApps.forEach(function(knownApp) {
		console.log("knownApp: " + JSON.stringify(knownApp));
		if ((typeof knownApp.appId != 'undefined') && (knownApp.title != "")) {
			console.log("creating option with appId: " + knownApp.appId + " and title: " + knownApp.title);
			select.append($('<option></option>').val(knownApp.appId).html(knownApp.title));
		}
	});

	if (selectedApps) {
		select.val(selectedApps);
	}
};