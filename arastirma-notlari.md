​Entropi Üretimi

math.random() komutu tahmin edilebilir bir pseudorandom üretir. window.crypto.getRandomValues ise OS çekirdeğindeki özel rastgele sayı üreten çip ile üretir. biz ikincisini kullandık.



\---



BIP39 Mnemonic

üretilen entropinin SHA 256 özetinin ilk 4 biti checksum olarak sona eklendi, 11 bitlik 12 parçaya ayrılarak 2048 kelimelik İngilizce BIP39 sözlüğünden 12 kelimeye dönüştürüldü.



BIP39 Seed

12 kelime ve boş passphrase, PBKDF2-HMAC-SHA512 algoritmasından 2048 tur geçirilerek 512 bitlik seed değerine dönüştürüldü


BPT32/BIP44 türetme ve Private Key

512 bitlik seedden "hiyerarşik deterministik" ana düşüm üretildi ve standard ethereum yolu (m/44'/60'/0'/0/0) takip edilerek 256 bitlik private key türetildi.
NOT: hiyerarşik determinizm: hiyerarşik ağaç yapısında organize edilmiş veri demek. deterministik ise aynı seed verildiğinde her zaman aynı private key oluşturulduğu anlamına geliyor.



Public Key

Private Key'den 

Not: Eliptik Eğri Çarpması: private key'den public key üretmek için kullanılan tek yönlü matematiksel işlem. çarpma dediğimiz şey, eğri üzerindeki bir başlangıç noktasının kendisiyle defalarca toplanması. (toplama dedimiz de aslında toplama değil, iki noktayı toplamak aslında aralarında düz bir doğru çizip o doğrunun eğriyi kestiği noktanın x eksenine göre simetriği alınıp çıkan sonuçtur..)



Ethereum Adresi

Açık anahtarın Keccak-256 özetinin son 20 byteı alınıp EIP-55 büyük/küçük harf kontrol toplamı (checksum) uygulanarak eth adresi oluşturulur.



Benim Yorumum: Mnemonic farklı blokzincir adreslerini hiyerarşik deterministik olarak(üstte tanımı var) yeniden üretebilen ana kök yedeklemesidir, Private Key ise bu ağaçtaki tek bir adrese alt işlem imzalama anahtarıdır.

