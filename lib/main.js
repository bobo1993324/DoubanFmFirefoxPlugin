const {Cc, Ci, Cu, Cr} = require('chrome');
var data = require("self").data;
// The main module of the bobo1993324 Add-on.

// Modules needed are `require`d, similar to CommonJS modules.
// In this case, creating a Widget that opens a new tab needs both the
// `widget` and the `tabs` modules.

var jsonSong = [];
var name, currentName;
var musicRecieved = false;
var tmpMusic;
var statusMessage;
var statusPanel;
var statusWidget;

var timer = require("timers");
// store encryped name and real name of songs

// !song

function findName(requestName) {
	// console.log(requestName);
	for (i in jsonSong) {
		// console.log(jsonSong[i].url);
		if (jsonSong[i].url.indexOf(requestName, 0) >= 0) {
			// console.log("find name " + jsonSong[i].title);
			var utf8Converter = Cc["@mozilla.org/intl/utf8converterservice;1"].getService(Ci.nsIUTF8ConverterService);
			var name = utf8Converter.convertURISpecToUTF8(jsonSong[i].artist + "_" + jsonSong[i].title + ".mp3", "UTF-8");
			return name;
		}
	}
	return "unknown";
}

function likeSong(requestName) {
	for (i in jsonSong) {
		// console.log(jsonSong[i].url);
		if (jsonSong[i].url == requestName) {
			// console.log("find name " + jsonSong[i].title);
			if (jsonSong[i].like == 1) {
				// console.log("like");
				return true;
			} else {
				// console.log("not like");
				return false;
			}
		}
	}
}

// panel

function update(arg) {
	statusPanel.port.emit("change status", arg);
	statusPanel.show();
	timer.setTimeout(function() {
		statusPanel.hide();
	}, 2000);
}

// !file lib

function save(name, data) {
	var aFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
	aFile.initWithPath(require("simple-prefs").prefs.musicDirectory);
	aFile.append(name.replace(/\//g, '&'));
	if (isFileExisted(name)) {
		aFile.remove(false);
	}
	aFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0600);
	var stream = Cc["@mozilla.org/network/safe-file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
	stream.init(aFile, 0x04 | 0x08 | 0x20, 0600, 0);
	// readwrite, create, truncate

	stream.write(data, data.length);
	if ( stream instanceof Ci.nsISafeOutputStream) {
		stream.finish();
	} else {
		stream.close();
	}
	//console.log('save ' + name);
}

function removeFile(name) {
	var aFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
	aFile.initWithPath(require("simple-prefs").prefs.musicDirectory);
	aFile.append(name.replace(/\//g, '&'));
	aFile.remove(false);
}

function isFileExisted(name) {
	var aFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
	aFile.initWithPath(require("simple-prefs").prefs.musicDirectory);
	try {
		aFile.append(name.replace(/\//g, '&'));
	} catch (ex) {
		// name containing /
		return false;
	}
	return aFile.exists();
}

function testIfSaveDirExisted() {
	var aFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
	try {
		aFile.initWithPath(require("simple-prefs").prefs.musicDirectory);
	} catch(e) {
		return false;
	}
	return aFile.exists();
}

// return a list of name
function listFiles(dir) {
	var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
	file.initWithPath(dir);
	var children = file.directoryEntries;
	var child;
	var list = [];
	while (children.hasMoreElements()) {
		child = children.getNext().QueryInterface(Ci.nsILocalFile);
		list.push(child.leafName);
	}
	return list;
}

// !intercept http traffic
var observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);

var httpRequestObserver = {
	observe : function(aSubject, aTopic, aData) {
		if (aTopic == "http-on-examine-response") {
			var newListener = new TracingListener();
			aSubject.QueryInterface(Ci.nsITraceableChannel);
			newListener.originalListener = aSubject.setNewListener(newListener);
		}
	},

	QueryInterface : function(aIID) {
		if (aIID.equals(Ci.nsIObserver) || aIID.equals(Ci.nsISupports)) {
			return this;
		}

		throw Cr.NS_NOINTERFACE;

	}
};

function registerHttpRequestObserver() {
	observerService.addObserver(httpRequestObserver, "http-on-examine-response", false);
}

function unregisterHttpRequestObserver() {
	observerService.removeObserver(httpRequestObserver, "http-on-examine-response");
}

// Helper function for XPCOM instanciation (from Firebug)
function CCIN(cName, ifaceName) {
	return Cc[cName].createInstance(Ci[ifaceName]);
}

// Copy response listener implementation.
function TracingListener() {
	this.originalListener = null;
	this.receivedData = [];
	// array for incoming data.
}

TracingListener.prototype = {
	onDataAvailable : function(request, context, inputStream, offset, count) {
		var binaryInputStream = CCIN("@mozilla.org/binaryinputstream;1", "nsIBinaryInputStream");
		var storageStream = CCIN("@mozilla.org/storagestream;1", "nsIStorageStream");
		var binaryOutputStream = CCIN("@mozilla.org/binaryoutputstream;1", "nsIBinaryOutputStream");

		binaryInputStream.setInputStream(inputStream);
		storageStream.init(8192, count, null);
		binaryOutputStream.setOutputStream(storageStream.getOutputStream(0));

		// Copy received data as they come.
		var data = binaryInputStream.readBytes(count);

		this.receivedData.push(data);
		binaryOutputStream.writeBytes(data, count);
		try {
			this.originalListener.onDataAvailable(request, context, storageStream.newInputStream(0), offset, count);
		} catch (e) {
		}
	},
	onStartRequest : function(request, context) {
		this.originalListener.onStartRequest(request, context);
	},

	onStopRequest : function(request, context, statusCode) {
		if (request.name.indexOf("playlist") > 0) {
			var responseSource = this.receivedData.join("");
			try {
				obj = JSON.parse(responseSource);
				if (obj.song) {
					for (i in obj.song) {
						jsonSong.push(obj.song[i]);
					}
				}
			} catch (ex) {
				console.log("exception at JSON.parse");
			}
		} else if (request.name.indexOf("mp3") == request.name.length - 3) {
			// it is a music
			var responseSource = this.receivedData.join("");
			// console.log("recieve mp3");
			name = findName(request.name);

			if (currentName == name) {
				musicRecieved = true;
				statusWidget.contentURL = data.url("doubanfmOK.png");
				if (likeSong(request.name) && !isFileExisted(name)) {
					update("save " + name.replace(/\//g, '&'));
					save(name, responseSource);
				} else {
					tmpMusic = responseSource;
				}
			} else {
				//console.log("recieve old music");
			}
		}
		this.originalListener.onStopRequest(request, context, statusCode);
	},
	QueryInterface : function(aIID) {
		if (aIID.equals(Ci.nsIStreamListener) || aIID.equals(Ci.nsISupports)) {
			return this;
		}
		throw Cr.NS_NOINTERFACE;
	}
}

var nsIHttpActivityObserver = Ci.nsIHttpActivityObserver;

var httpObserver = {
	observeActivity : function(aHttpChannel, aActivityType, aActivitySubtype, aTimestamp, aExtraSizeData, aExtraStringData) {
		if (aActivityType == nsIHttpActivityObserver.ACTIVITY_TYPE_HTTP_TRANSACTION) {
			switch (aActivitySubtype) {
				case nsIHttpActivityObserver.ACTIVITY_SUBTYPE_REQUEST_HEADER:
					// received response header
					if (aExtraStringData.indexOf('/j/mine/playlist', 0) > 0) {

						type = aExtraStringData.substring(aExtraStringData.indexOf("type") + 5, aExtraStringData.indexOf("type") + 6);
						if (type == "r") {
							if (musicRecieved) {
								update("save" + name.replace(/\//g, '&'));
								// console.log("save" + name);
								save(name, tmpMusic);
							} else {
								update("music not recieved");
							}
						} else if (type == "u") {
							if (isFileExisted(name.replace(/\//g, '&'))) {
								removeFile(name.replace(/\//g, '&'));
								update("remove " + name.replace(/\//g, '&'));
							}
						} else {
							// console.log("set musicRecieved false");
							musicRecieved = false;
							statusWidget.contentURL = data.url("doubanfmNo.png");
							// listFiles(require("simple-prefs").prefs.musicDirectory);
						}
					}
					if (aExtraStringData.indexOf('mp3', 0) > 0 && aExtraStringData.indexOf('except_report', 0) < 0) {
						// console.log(aExtraStringData);
						tmp = aExtraStringData.substring(aExtraStringData.indexOf(".mp3") - 7, aExtraStringData.indexOf(".mp3"));
						// console.log(tmp);
						currentName = findName(tmp);
					}
					break;
			}
		}
	}
};

function registerHttpActivityObserver() {
	var activityDistributor = Cc["@mozilla.org/network/http-activity-distributor;1"].getService(Ci.nsIHttpActivityDistributor);
	activityDistributor.addObserver(httpObserver);
}

var registered = false;
var widgetClicked = false;
var pageMod = require("page-mod");
var self = require("self");
pageMod.PageMod({
	include : "*.douban.fm",
	onAttach : function onAttach(worker) {
		if (registered == false) {
			statusPanel = require("panel").Panel({
				// width: 300,
				// height: 100,
				contentURL : data.url("status_panel.html"),
				contentScriptFile : data.url("change_status.js"),
			});
			if (testIfSaveDirExisted()) {
				statusWidget = require("widget").Widget({
					label : "DoubanFm",
					id : "DoubanFm",
					contentURL : data.url("doubanfmOK.png"),
					panel : statusPanel,
					onClick : function() {
						widgetClicked = true;
					}
				});
				statusPanel.on("show", function() {
					if (widgetClicked) {
						widgetClicked = false;
						// console.log("panel clicked show");
						nameList = listFiles(require("simple-prefs").prefs.musicDirectory);
						resultString = "<p> music by the same performer:</p>";
						var i;
						for ( i = 0; i < nameList.length; i++) {
							if (nameList[i].split("_")[0] == (currentName.replace(/\//g, '&')).split("_")[0])
								resultString += "<p>" + nameList[i] + "</p>";
						}
						statusPanel.port.emit("change status", resultString);
					} else {
						// console.log("panel unclicked show");
					}
				})
				registerHttpRequestObserver();
				registerHttpActivityObserver();
			} else {
				statusWidget = require("widget").Widget({
					label : "DoubanFm",
					id : "DoubanFm",
					contentURL : data.url("doubanfmNo.png"),
					panel : statusPanel,
				});
				statusPanel.port.emit("change status", "DoubanFm add-on:<\p>Music diretory doesn't exist, please configure it at 附加组建->拓展->save Music From DoubanFm->首选项->musicDirectory and restart");
				statusPanel.show();
			}
			registered = true;
		}
	}
});

//! debug
// function print_r(theObj) {
// var retStr = '';
// if ( typeof theObj == 'object') {
// retStr += '<div style="font-family:Tahoma; font-size:7pt;">';
// for (var p in theObj) {
// if ( typeof theObj[p] == 'object') {
// retStr += '<div><b>[' + p + '] => ' + typeof (theObj) + '</b></div>';
// retStr += '<div style="padding-left:25px;">' + print_r(theObj[p]) + '</div>';
// } else {
// retStr += '<div>[' + p + '] => <b>' + theObj[p] + '</b></div>';
// }
// }
// retStr += '</div>';
// }
// console.log(retStr);
// }
