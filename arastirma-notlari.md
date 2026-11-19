## İP 12



​Entropi Üretimi

math.random() komutu tahmin edilebilir bir pseudorandom üretir. window.crypto.getRandomValues ise OS çekirdeğindeki özel rastgele sayı üreten çip ile üretir. biz ikincisini kullandık.



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







## İP 13



Adres Eşlemesi

index.html ile oluşturduğum 12-phrase ile metamask'e aktardığım aynı kelimelerin oluşturduğu adreslerin aynı olduğunu ekran resmi alarak doğruladım.



Checksum Gözlemi

12-phrase'den en sondakini rastgele car kelimesiyle değiştirdim ve ip13-checksum.png den de görüleceği üzere geçersiz oldu.

ancak son kelimeyi address kelimesiyle değiştirince doğru olmamasına rağmen 1/16 false-positive hata oranından dolayı kabul edildi.



Benim Yorumum

aynı iddia değildir. bir mnemonic'in geçerli olması sadece 12 kelimenin BIP39 sözlüğünde bulunduğunu ve son 4 bitlik SHA-256 kontrol toplamı (checksum) kuralını sağladığını gösterir.







## İP 14



Kullanılan Fauced: Google Cloud Web3 Faucet

Koşulları: Sadece Google hesabı

Gelen işlem Tx hash: 0x635e45ad49d5523ab02eb737f2ba5764d8ce498505643770bac06b9529e93ec2



PoW Faucet ve Ağ Konsensüsü Farkı
Eğer PoW tabanlı bir faucet kullanıldıysa tarayıcının hash hesaplaması Sepolia ağında blok üretmek/işlem onaylamak için değildir.

\- Ethereum Proof of Stake konsensüsü ile çalışır. PoW faucet'teki hesaplama botların/kötü niyetlilerin tek seferde tüm test ETH'lerini sömürmesini zorlaştırmak için faucet operatörünün koyduğu yapay bir hız sınırlama koşuludur.



Benim Yorumum: Harcama yetkisi için Private key gereklidir. Adresten veya Public Key'den private key elde etmek neredeyse imkansız. çünkü 256 bitlik private ket 2 üzeri 256 ihtimalde bir aynı olabilir, ki bu ihtimali brute force ile hesaplamak neredeyse imkansızdır.







## İP 15







