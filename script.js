"use strict";

// Array of API discovery doc URLs for APIs used by the quickstart
var DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
    'https://docs.googleapis.com/$discovery/rest?version=v1'];

// Authorization scopes required by the API; multiple scopes can be
// included, separated by spaces.
var SCOPES = 'https://www.googleapis.com/auth/drive.file';

// The title and ID of the notes document
var DOC_TITLE = 'Note Maker Notes';
var documentId;

var authorizeButton = document.getElementById('authorize-button');
var signoutButton = document.getElementById('signout-button');
var urlForm = document.getElementById('url-form');
var keyForm = document.getElementById('key-form');

var counter = 0;
var response;
//keyForm.style.display = 'none';  // Begin with keyForm hidden

/**
 *  On load, displays keyForm.
 */
//function handleClientLoad() {
//    keyForm.style.display = 'block';
//}

/**
 *  On keyForm submit, calls initCient to
 *  load the auth2 library and API client library.
 */
function handleKeys(event) {
    event.preventDefault();  // Don't submit the form
    gapi.load('client:auth2', initClient);
}

/**
 *  Initialize the API client library and sets up sign-in state listeners.
 */
function initClient() {
    gapi.client.init({
        apiKey: keyForm['api-key'].value,
        clientId: keyForm['client-id'].value,
        discoveryDocs: DISCOVERY_DOCS,
        scope: SCOPES
    }).then(function () {
        // Listen for sign-in state changes.
        gapi.auth2.getAuthInstance().isSignedIn.listen(updateSigninStatus);

        // Handle the initial sign-in state.
        updateSigninStatus(gapi.auth2.getAuthInstance().isSignedIn.get());
        authorizeButton.onclick = handleAuthClick;
        signoutButton.onclick = handleSignoutClick;
        keyForm.style.display = 'none';
    }, function (error) {
        appendPre(JSON.stringify(error, null, 2));
    });
}

/**
 *  Called when the signed in status changes, to update the UI
 *  appropriately. After a sign-in, the API is called.
 */
function updateSigninStatus(isSignedIn) {
    if (isSignedIn) {
        authorizeButton.style.display = 'none';
        signoutButton.style.display = 'block';
        findOrCreateDoc(DOC_TITLE);
    } else {
        authorizeButton.style.display = 'block';
        signoutButton.style.display = 'none';
        urlForm.style.display = 'none';
    }
}

/**
 *  Sign in the user upon button click.
 */
function handleAuthClick(event) {
    gapi.auth2.getAuthInstance().signIn();
}

/**
 *  Sign out the user upon button click.
 */
function handleSignoutClick(event) {
    gapi.auth2.getAuthInstance().signOut();
}

/**
 * Append a pre element to the body containing the given message
 * as its text node. Used to display the results of the API call.
 *
 * @param {string} message Text to be placed in pre element.
 */
function appendPre(message) {
    var pre = document.getElementById('content');
    var textContent = document.createTextNode(message + '\n');
    pre.appendChild(textContent);
}

/**
 * Print names and IDs of each document in files.
 */
function printDocInfo(files) {
    if (files && files.length) {
        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            appendPre(`ID: ${file.id} ("${file.name}")`);
        }
    } else {
        appendPre('No matching documents found.');
    }
}

/**
 * Find all documents with given title.
 */
function findDocs(title) {
    return new Promise(function (resolve, reject) {
        var retrievePageOfFiles = function (promise, answer) {
            promise.then(function (response) {
                answer = answer.concat(response.result.files);
                var nextPageToken = response.result.nextPageToken;
                if (nextPageToken) {
                    promise = gapi.client.drive.files.list({
                        pageToken: nextPageToken,
                        q: `name = '${title}' and trashed = false`,
                        pageSize: 10,
                        fields: 'nextPageToken, files(id, name)'
                    });
                    retrievePageOfFiles(promise, answer);
                } else {
                    resolve(answer);
                }
            }), function (response) {
                appendPre('Error (list): ' + response.result.error.message);
            };
        }
        var initialPromise = gapi.client.drive.files.list({
            q: `name = '${title}' and trashed = false`,
            pageSize: 10,
            fields: 'nextPageToken, files(id, name)'
        });
        retrievePageOfFiles(initialPromise, []);
    });
}

/**
 * Create a new document with given title.
 */
function createDoc(title) {
    return gapi.client.docs.documents.create({
        title: title
    }).then(function (response) {
        var doc = response.result;
        var title = doc.title;
        var id = doc.documentId;
        appendPre(`Document "${title}" created with ID ${id}.\n`);
        return id;
    }, function (response) {
        appendPre('Error (create): ' + response.result.error.message);
    });
}

/**
 * Find or create a single document with given title.
 * Complain, if there is more than one such document.
 */
function findOrCreateDoc(title) {
    findDocs(title).then(function (files) {
        if (!files.length) {
            createDoc(title).then(function (docId) {
                urlForm.style.display = 'block';
                documentId = docId;
            });
        } else if (files.length === 1) {
            appendPre('Using the following document for notes:');
            printDocInfo(files);
            urlForm.style.display = 'block';
            documentId = files[0].id;
        } else {
            // Complain; too many files
            appendPre('Error: multiple matching documents; please delete all but one:');
            printDocInfo(files);
            urlForm.style.display = 'none';
        }
    });
}

/**
 * Insert notes at the start of document (with a header for the URL).
 */
function addNotesToDoc(event) {
    appendPre('\nAdding notes to doc...');
    event.preventDefault();  // Don't submit the form

    // Configure AJAX requests to go through CORS Anywhere proxy
    $.ajaxPrefilter(function (options) {
        if (options.crossDomain && $.support.cors) {
            options.url = 'https://cors-anywhere.herokuapp.com/' + options.url;
            options.crossDomain = false;
        }
    });

    // Get contents of URL, and add summary into document w/ documentId
    $.get(urlForm.url.value,
        function (data) {
            // $($.parseHTML(data)) is safer than $(data) with spaces, etc.
            // context is null: use new document; keepScripts is false
            var $data = $($.parseHTML(data, null, false));
            var $tags = $data.find('h1, h2, h3, h4, strong, b, em, i, mark');

            // Make an array of requests in reverse order, so we always
            // insert text at the beginning and then modify its styling
            var requests = $tags.map(function () {
                // Squash all whitespaces, including newlines, into a single ' '
                var tagText = this.textContent.trim().replace(/\s+/g, ' ');
                if (!tagText) return null;  // Skip whitespace-only tagText

                var itRequest = {  // InsertTextRequest
                    insertText: {
                        text: tagText + '\n',
                        location: {   // No segmentId is body
                            index: 1  // Treated as 'segmentId: ""'
                        }
                    }
                };
                var upsRequest = {  // UpdateParagraphStyleRequest
                    updateParagraphStyle: {
                        paragraphStyle: {
                            // Convert H tags to corresponding Google headings
                            namedStyleType: this.tagName[0] === 'H' ?
                                'HEADING_' + this.tagName[1] : 'NORMAL_TEXT'
                        },
                        range: {
                            startIndex: 1,  // No segmentId is body
                            endIndex: 1     // Treated as 'segmentId: ""'
                        },
                        fields: "namedStyleType"
                    }
                };
                if (this.tagName[0] !== 'H') {
                    // For non-headings, set text styles
                    var styleMap = {
                        STRONG: 'bold', B: 'bold',
                        EM: 'italic', I: 'italic',
                        MARK: 'underline'
                    };

                    var utsRequest = {  // UpdateTextStyleRequest
                        updateTextStyle: {
                            textStyle: {
                                [styleMap[this.tagName]]: true
                            },
                            range: {
                                startIndex: 1,
                                endIndex: tagText.length + 1
                            },
                            fields: styleMap[this.tagName]
                        }
                    };
                    return [utsRequest, upsRequest, itRequest];
                }
                return [upsRequest, itRequest];  // Headings (no text-style update)
            }).get().reverse();

            // Make a batchUpdate call containing the collected requests
            gapi.client.docs.documents.batchUpdate({
                documentId: documentId,
                resource: {
                    requests: requests
                }
            }).then(function (response) {
                // Clear out the URL input for next use on full success
                // but leave for editing in case of any error
                urlForm.url.value = '';
                appendPre('Notes successfully added.');
            }, function (response) {
                appendPre('Error (batchUpdate): ' + response.result.error.message);
            });
        }
    ).fail(function(jqXHR, textStatus, error) {
        appendPre(`Error (get): ${error} (status: ${textStatus})`);
    });
}

function toggleMenu() {
    counter++;
    var menu = document.getElementById("menu-links");
    var header = document.getElementById("page-header");
    if (counter % 2 === 1) {
        menu.style.display = "block";
        menu.style.animation = "1s linear slide-in";
        header.style.display = "none";
    } else {
        header.style.display = "block";
        header.style.animation = "1s linear slide-in"
        menu.style.display = "none";
    };

}

var linkArr;

function handlePwd() {
    const inputPwd = $("#pwd").val();
    if (inputPwd === "k") {
        var gdocDiv = $("#gdoc");
        var iframe;
        for (var i = 0; i < linkArr.length; i++) {
            iframe = gdocDiv.append(`<iframe src="${linkArr[i]}" class="iframe"
                    allowfullscreen="true" mozallowfullscreen="true" webkitallowfullscreen="true"></iframe>`);
        };
        $(".pwd").css("display","none");
    } else {
        $("body").append("<p>").text("Sorry, try again");
    }
}

window.onload = function() {
    if (window.location.href.includes("writings")) {
        linkArr = ["https://docs.google.com/document/d/15DkoQkqqjwtwyqcUKQ4jupOY6JkgPTtQq5Y_pjdPjmY/edit?tab=t.0",
        "https://docs.google.com/document/d/15DkoQkqqjwtwyqcUKQ4jupOY6JkgPTtQq5Y_pjdPjmY/edit?tab=t.0"];
    } else if (window.location.href.includes("course-notes.html?courseID=")) {
        async function getObj() {
            response = await (await fetch("./course-notes.json")).json();
            objToHTML(response);
        }
        getObj();
    } else if (window.location.href.includes("course-notes.html")) {
        async function getObj() {
            response = await (await fetch("./course-notes.json")).json();
            // search(response);
            organizeObj(response);
        }
        getObj();
    }
}

function objToHTML(obj) {
    var loc = window.location.href
    var courseID = loc.slice(loc.length-7, loc.length)
    document.getElementById("main-page").style.display = "none";
    var h1 = $("<h1>").html(courseID.toUpperCase());
    var h3 = $("<h3>").html("Course Information")
    var p = $("<p>").html(obj[courseID].college + ", " + obj[courseID].semester + ", " + obj[courseID].format)
    var iframe = $("<iframe>").addClass("iframe").attr("src", obj[courseID].href);
    $("#course").append(h1).append(h3).append(p).append(iframe);
}

function search(response) {
    var input = document.getElementById("course-search").value;
    var ul = $("<ul>").appendTo($("#course"));
    var li;
    for (let i = 0; i < Object.keys(response).length; i++) {
        if (Object.keys(response)[i] == input || Object.keys(response)[i].cname == input) {
            li = $("<li>").html(response[i].cname);
            ul.append(li);
        }
    }
}

function organizeObj(response) {
    var arr = ["Fall 2023", "Spring 2024", "Fall 2024", "Spring 2025", "Fall 2025", "Winter 2026"]
    var h3, a, r, ul, className, li;
    for (let i = 0; i < arr.length; i++) {
        className = arr[i].toLowerCase().replace(" ", "-")
        ul = $("<ul>").appendTo($("#course-columns"));
        ul.wrap(`<div class="${className}"></div>`);
        h3 = $("<h3>").html(arr[i]).appendTo($(`.${className}`));
        for (let j = 0; j < Object.keys(response).length; j++) {
            r = Object.keys(response)[j].toString();
            if (response[r].semester == arr[i]) {
                console.log("passed " + r, response[r].semester)
                a = $("<a>").attr("href", window.location.href + "?courseID=" + r)
                    .html(response[r].cname)
                    .appendTo($(`.${className}`));
                a.wrap(ul).wrap("<li></li>");
            } else console.log("failed: " + r, response[r].semester);
        }
    }
}