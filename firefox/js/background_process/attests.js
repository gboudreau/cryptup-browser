/* Business Source License 1.0 © 2016 FlowCrypt Limited (tom@cryptup.org). Use limitations apply. This version will change to GPLv3 on 2020-01-01. See https://github.com/CryptUp/cryptup-browser/tree/master/src/LICENCE */

'use strict';

var CHECK_TIMEOUT = 5 * 1000; // first check in 5 seconds
var CHECK_INTERVAL = 5 * 60 * 1000; // subsequent checks every five minutes. Progressive increments would be better
var ATTESTERS = {
  CRYPTUP: { email: 'attest@cryptup.org', api: undefined, pubkey: undefined }
};

var currently_watching = {};
var can_read_emails = {};
var packet_headers = tool.crypto.armor.headers('attest_packet');

refresh_attest_requests_and_privileges(function (account_email, attests_requested) {
  if(attests_requested && attests_requested.length && can_read_emails[account_email]) {
    watch_for_attest_email(account_email);
  }
});

function attest_requested_handler(message, sender, respond) {
  respond();
  refresh_attest_requests_and_privileges(null, function () {
    watch_for_attest_email(message.account_email);
  });
}

function attest_packet_received_handler(message, sender, respond) {
  process_attest_packet_text(message.account_email, message.packet, message.passphrase, function(account, packet, success, result) {
    add_attest_log(account, packet, success, result, function() {
      respond({success: success, result: result});
    });
  });
}

function watch_for_attest_email(account_email) {
  clearInterval(currently_watching[account_email]);
  setTimeout(function () {
    check_email_for_attests_and_respond(account_email);
  }, CHECK_TIMEOUT);
  currently_watching[account_email] = setInterval(function () {
    check_email_for_attests_and_respond(account_email);
  }, CHECK_INTERVAL);
}

function stop_watching(account_email) {
  clearInterval(currently_watching[account_email]);
  delete currently_watching[account_email];
}

function check_email_for_attests_and_respond(account_email) {
  account_storage_get(account_email, ['attests_requested'], function (storage) {
    if(get_passphrase(account_email)) {
      if(storage.attests_requested && storage.attests_requested.length && can_read_emails[account_email]) {
        fetch_attest_emails(account_email, function (success, messages) {
          if(success && messages) {
            $.each(messages, function (id, message) {
              process_attest_email(account_email, message);
            });
          }
        });
      } else {
        add_attest_log(false, 'cannot fetch attest emails for ' + account_email);
        stop_watching(account_email);
      }
    } else {
      console.log('cannot get pass phrase for signing - skip fetching attest emails for ' + account_email);
    }
  });
}

function process_attest_packet_text(account_email, attest_packet_text, passphrase, callback) {
  var attest = tool.api.attester.packet.parse(attest_packet_text);
  var key = openpgp.key.readArmored(private_storage_get('local', account_email, 'master_private_key')).keys[0];
  is_already_attested(account_email, attest.attester, function (is_attested) {
    if (!is_attested) {
      if (tool.crypto.key.decrypt(key, passphrase || get_passphrase(account_email)).success) {
        var expected_fingerprint = key.primaryKey.fingerprint.toUpperCase();
        var expected_email_hash = tool.crypto.hash.double_sha1_upper(tool.str.trim_lower(account_email));
        if (attest && attest.success && attest.content.attester in ATTESTERS && attest.content.fingerprint === expected_fingerprint && attest.content.email_hash === expected_email_hash) {
          tool.crypto.message.sign(key, attest.text, true, function (success, result) {
            if (success) {
              if (attest.content.action !== 'CONFIRM_REPLACEMENT') {
                var keyserver_api_endpoint = tool.api.attester.initial_confirm;
              } else {
                var keyserver_api_endpoint = tool.api.attester.replace_confirm;
              }
              keyserver_api_endpoint(result, function (success, response) {
                if (success && response && response.attested) {
                  account_storage_mark_as_attested(account_email, attest.content.attester, function () {
                    callback(account_email, attest_packet_text, true, 'Successfully attested ' + account_email);
                  });
                } else {
                  callback(account_email, attest_packet_text, false, 'Refused by Attester. Write me at tom@cryptup.org to find out why.\n\n' + JSON.stringify(response));
                }
              });
            } else {
              attest.packet_text = attest_packet_text;
              catcher.log('Error signing ' + attest.content.action + ' attest packet: ' + result, attest);
              callback(account_email, attest_packet_text, false, 'Error signing the attest. Write me at tom@cryptup.org to find out why:' + result);
            }
          });
        } else {
          callback(account_email, attest_packet_text, false, 'This attest message is ignored as it does not match your settings.\n\nWrite me at tom@cryptup.org to help.');
        }
      } else {
        callback(account_email, attest_packet_text, false, 'Missing pass phrase to process this attest message.\n\nIt will be processed automatically later.');
      }
    } else {
      callback(account_email, attest_packet_text, true, attest.content.attester + ' already attested ' + account_email);
      stop_watching(account_email);
    }
  });
}

function process_attest_email(account_email, gmail_message_object) {
  if(gmail_message_object.payload.mimeType === 'text/plain' && gmail_message_object.payload.body.size > 0) {
    process_attest_packet_text(account_email, tool.str.base64url_decode(gmail_message_object.payload.body.data), null, add_attest_log);
  }
}

function fetch_attest_emails(account_email, callback) {
  var q = [
    '(from:"' + get_attester_emails().join('" OR from: "') + '")',
    'to:' + account_email, // for now limited to account email only. Alternative addresses won't work.
    'in:anywhere',
    '"' + packet_headers.begin + '"',
    '"' + packet_headers.end + '"',
  ];
  tool.api.gmail.message_list(account_email, q.join(' '), true, function (success, response) {
    if(success) {
      if(response.messages) {
        var message_ids = [];
        $.each(response.messages, function (i, message) {
          message_ids.push(message.id);
        });
        tool.api.gmail.message_get(account_email, message_ids, 'full', callback);
      } else {
        callback(true, null);
      }
    } else {
      callback(false, 'Connection dropped while checking attests.');
    }
  });
}

function refresh_attest_requests_and_privileges(process_account_email_callback, refresh_done_callback) {
  get_account_emails(function (account_emails) {
    account_storage_get(account_emails, ['attests_requested', 'google_token_scopes'], function (multi_storage) {
      $.each(multi_storage, function (account_email, storage) {
        can_read_emails[account_email] = tool.api.gmail.has_scope(storage.google_token_scopes, 'read');
        if(process_account_email_callback) {
          process_account_email_callback(account_email, storage.attests_requested);
        }
      });
      if(refresh_done_callback) {
        refresh_done_callback();
      }
    });
  });
}

function get_attester_emails() {
  var emails = [];
  $.each(ATTESTERS, function (id, attester) {
    emails.push(attester.email);
  });
  return emails;
}

function is_already_attested(account_email, attester, callback) {
  account_storage_get(account_email, ['attests_processed'], function (storage) {
    callback(tool.value(attester).in(storage.attests_processed));
  });
}

function account_storage_mark_as_attested(account_email, attester, callback) {
  stop_watching(account_email);
  account_storage_get(account_email, ['attests_requested', 'attests_processed'], function (storage) {
    if(tool.value(attester).in(storage.attests_requested)) {
      storage.attests_requested.splice(storage.attests_requested.indexOf(attester), 1); //remove attester from requested
      if(typeof storage.attests_processed === 'undefined') {
        storage.attests_processed = [];
      }
      if(!tool.value(attester).in(storage.attests_processed)) {
        storage.attests_processed.push(attester); //add attester as processed if not already there
      }
      account_storage_set(account_email, storage, callback);
    } else {
      callback();
    }
  });
}

function add_attest_log(account_email, packet, success, attestation_result_text, callback) {
  console.log('attest result ' + success + ': ' + attestation_result_text);
  account_storage_get(account_email, ['attest_log'], function(storage) {
    if(!storage.attest_log) {
      storage.attest_log = [];
    } else if(storage.attest_log.length > 100) {
      storage.attest_log = [{attempt: 100, success: false, result: 'DELETED 100 LOGS'}];
    }
    storage.attest_log.push({attempt: storage.attest_log.length + 1, packet: packet, success: success, result: attestation_result_text});
    account_storage_set(account_email, storage, callback);
  });
}