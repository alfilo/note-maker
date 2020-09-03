
// (OAuth 2.0) Client ID and API key from the Developer Console
var CLIENT_ID = '<YOUR_CLIENT_ID>';
var API_KEY = '<YOUR_API_KEY>';

// Array of API discovery doc URLs for APIs used by the quickstart
var DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
    'https://docs.googleapis.com/$discovery/rest?version=v1'];

// Authorization scopes required by the API; multiple scopes can be
// included, separated by spaces.
var SCOPES = 'https://www.googleapis.com/auth/drive.file';

// The title of the notes document
var DOC_TITLE = 'Note Maker Notes';

var authorizeButton = document.getElementById('authorize_button');
var signoutButton = document.getElementById('signout_button');

/**
 *  On load, called to load the auth2 library and API client library.
 */
function handleClientLoad() {
    gapi.load('client:auth2', initClient);
}

/**
 *  Initialize the API client library and sets up sign-in state listeners.
 */
function initClient() {
    gapi.client.init({
        apiKey: API_KEY,
        clientId: CLIENT_ID,
        discoveryDocs: DISCOVERY_DOCS,
        scope: SCOPES
    }).then(function () {
        // Listen for sign-in state changes.
        gapi.auth2.getAuthInstance().isSignedIn.listen(updateSigninStatus);

        // Handle the initial sign-in state.
        updateSigninStatus(gapi.auth2.getAuthInstance().isSignedIn.get());
        authorizeButton.onclick = handleAuthClick;
        signoutButton.onclick = handleSignoutClick;
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
    appendPre('Matching documents:\n');
    if (files && files.length > 0) {
        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            appendPre(`Document ${i}: "${file.name}" (${file.id})`);
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
        if (files.length == 0) {
            createDoc(title).then(function (docId) {
                addNotesToDoc(docId);
            });
        } else if (files.length == 1) {
            // Add to existing file
            printDocInfo(files);
            addNotesToDoc(files[0].id);
        } else {
            // Complain; too many files
            appendPre('Error: too many matching documents; please delete all but one');
            printDocInfo(files);
        }
    });
}

/**
 * Append notes to end of file with a header for the URL.
 */
function addNotesToDoc(docId) {
    // Make a test request
    return gapi.client.docs.documents.batchUpdate({
        documentId: docId,
        resource: {
            requests: [
                {
                    insertText: {
                        text: `The current time is ${new Date()}.\n`,
                        // Body: no segmentId treated as 'segmentId: ""'
                        endOfSegmentLocation: {}  // end of body
                    }
                }
            ]
        }
    }).then(function (response) {
        appendPre(`Added content to doc with id ${docId}`);
    }, function (response) {
        appendPre(`Error (batchUpdate for ${docId}): ${response.result.error.message}`);
    });
}