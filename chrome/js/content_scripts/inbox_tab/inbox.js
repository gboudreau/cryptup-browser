/* Business Source License 1.0 © 2016 FlowCrypt Limited (tom@cryptup.org). Use limitations apply. This version will change to GPLv3 on 2020-01-01. See https://github.com/CryptUp/cryptup-browser/tree/master/src/LICENCE */

'use strict';

catcher.try(function() {

  var replace_pgp_elements_interval_ms = 1000;
  var replace_pgp_elements_interval;
  var replacer;

  content_script_setup_if_vacant({
    name: 'inbox',
    get_user_account_email:  function () {
      var account_email_loading_match = $('div.gb_xb, div.gb_wb').text().match(/^[a-z0-9._\-]+@[a-z0-9\-_.]+$/gi);
      return account_email_loading_match !== null ? account_email_loading_match[0].toLowerCase() : undefined;
    },
    get_user_full_name: function () {
      return $('div.gb_vb, div.gb_wb').text();
    },
    get_replacer: function () {
      return replacer;
    },
    start: start,
  });

  function start(account_email, inject, notifications, factory, notify_murdered) {
    account_storage_get(account_email, ['addresses', 'google_token_scopes'], function (storage) {
      var can_read_emails = tool.api.gmail.has_scope(storage.google_token_scopes, 'read');
      inject.buttons();
      replacer = gmail_element_replacer(factory, account_email, storage.addresses || [account_email], can_read_emails);
      notifications.show_initial(account_email);
      replacer.everything();
      replace_pgp_elements_interval = TrySetDestroyableInterval(function () {
        if(typeof window.$ === 'function') {
          replacer.everything();
        } else { // firefox will unload jquery when extension is restarted or updated
          clearInterval(replace_pgp_elements_interval);
          notify_murdered();
        }
      }, replace_pgp_elements_interval_ms);
    });
  }

})();