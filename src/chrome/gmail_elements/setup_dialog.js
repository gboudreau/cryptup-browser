

function create_save_submit_key_pair(email, email_name, passphrase){
  var user_id = email + ' <' + email_name + '>';
  openpgp.generateKeyPair({numBits: 4096, userId: user_id, passphrase: passphrase}).then(function(keypair){
    localStorage.master_private_key = keypair.privateKeyArmored;
    localStorage.master_public_key = keypair.publicKeyArmored;
    localStorage.master_public_key_submitted = false;
    localStorage.master_passphrase = '';
    keyserver_keys_submit(email, keypair.publicKeyArmored, function(key_submitted, response){
      if(key_submitted && response.saved === true) {
        localStorage.master_public_key_submitted = true;
      }
      else{
        //todo automatically resubmit later, make a notification if can't, etc
        console.log('warning: pubkey not submitted')
        console.log(respponse);
      }
      chrome.storage.local.set({cryptup_setup_done: true}, function(){
        send_signal('close_setup_dialog', 'setup_dialog', 'gmail_tab');
      });
    });
  }).catch(function(error) {
    $('#step_2_easy_generating').html('Error, thnaks for discovering it!<br/><br/>This is an early development version.<br/><br/>Please press CTRL+SHIFT+J, click on CONSOLE.<br/><br/>Copy messages printed in red and send them to me.<br/><br/>tom@cryptup.org - thanks!');
    console.log('--- copy message below for debugging  ---')
    console.log(error);
    console.log('--- thanks ---')
  });
}

$('a.close').click(function(){
  send_signal('close_setup_dialog', 'setup_dialog', 'gmail_tab');
});

$('div.setup_btn.one_click').click(function(){
  $('#step_1_easy_or_manual').css('display', 'none');
  $('#step_2_easy_generating').css('display', 'block');
  chrome.storage.local.get(['primary_email', 'primary_email_name'], function(storage) {
    create_save_submit_key_pair(storage['primary_email'], storage['primary_email_name'], null);
  });
});

$('div.setup_btn.manual').click(function(){
  $('#step_1_easy_or_manual').css('display', 'none');
  $('#step_2_manual').css('display', 'block');
});

$('div#btn_save_private').click(function(){
  localStorage.master_private_key = $('#input_private_key').val();
  localStorage.master_public_key = openpgp.key.readArmored($('#input_private_key').val()).keys[0].toPublic().armor();
  localStorage.master_passphrase = $('#input_passphrase').val();
  chrome.storage.local.set({cryptup_setup_done: true}, function(){
    send_signal('close_setup_dialog', 'setup_dialog', 'gmail_tab');
  });
});