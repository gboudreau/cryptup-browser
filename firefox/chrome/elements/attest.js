/* Business Source License 1.0 © 2016 FlowCrypt Limited (tom@cryptup.org). Use limitations apply. This version will change to GPLv3 on 2020-01-01. See https://github.com/CryptUp/cryptup-browser/tree/master/src/LICENCE */

'use strict';

tool.ui.event.protect();

var url_params = tool.env.url_params(['account_email', 'attest_packet', 'parent_tab_id']);

if(get_passphrase(url_params.account_email) !== null) {
  process_attest();
} else {
  $('.status').html('Pass phrase needed to process this attest message. <a href="#" class="action_passphrase">Enter pass phrase</a>')
  $('.action_passphrase').click(function() {
    tool.browser.message.send(url_params.parent_tab_id, 'passphrase_dialog', {type: 'attest'});
  });
  tool.browser.message.tab_id(function(tab_id) {
    tool.browser.message.listen({
      passphrase_entry: function(message, sender, respond) {
        if(message.entered && get_passphrase(url_params.account_email) !== null) {
          process_attest();
        }
      },
    })
  });
}

function process_attest() {
  $('.status').html('Verifying..' + tool.ui.spinner('green'));
  tool.browser.message.send(null, 'attest_packet_received', {
    account_email: url_params.account_email,
    packet: url_params.attest_packet,
    passphrase: get_passphrase(url_params.account_email),
  }, function(attestation) {
    tool.str.html_as_text(attestation.result.replace(/\n/g, '<br>'), function (text) {
      $('.status').addClass(attestation.success ? 'good' : 'bad').html(tool.str.html_escape(text).replace(/\n/g, '<br>'));
    });
  });
}
