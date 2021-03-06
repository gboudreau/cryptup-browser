/* Business Source License 1.0 © 2016 FlowCrypt Limited (tom@cryptup.org). Use limitations apply. This version will change to GPLv3 on 2020-01-01. See https://github.com/CryptUp/cryptup-browser/tree/master/src/LICENCE */

'use strict';

catcher.try(function() {

  var replace_pgp_elements_interval_ms = 1000;
  var replace_pgp_elements_interval;
  var replacer;

  content_script_setup_if_vacant({
    name: 'outlook',
    get_user_account_email:  function () {
      if(window.location.pathname === '/owa/') { // outlook webmail view
        var account_email_match = $('title').text().match(/[a-z0-9._]+@[a-z0-9\-_.]+/gi);
        return account_email_match !== null ? account_email_match[0].toLowerCase() : undefined;
      }
    },
    get_user_full_name: function () {
      return $('.o365cs-me-tileimg > .o365cs-me-personaimg').attr('title');
    },
    get_replacer: function () {
      return replacer;
    },
    start: start,
  });

  function start(account_email, inject, notifications, factory, notify_murdered) {
    account_storage_get(account_email, ['addresses'], function (storage) {
      inject.buttons();
      replacer = outlook_element_replacer(factory, account_email, storage.addresses || [account_email]);
      notifications.show_initial(account_email);
      replacer.everything();
      replace_pgp_elements_interval = TrySetDestroyableInterval(function () {
        if(typeof window.$ === 'function') {
          replacer.everything();
        } else { // firefox will unload jquery when extension is restarted or updated.
          clearInterval(replace_pgp_elements_interval);
          notify_murdered();
        }
      }, replace_pgp_elements_interval_ms);
    });
  }

})();