## İP 7



Cüzdan bağlamak, uygulamaya yalnızca public adresi ve ağ bilgisini okuma izni vermektir. zincirde hiçbir şey yapılmaz.


mesaj imzalamak, offchain bir veriyi kendi private anahtarımızla doğrulamak için yapılır. zincire veri eklenmez.



işlem göndermek, kendi private keyimizle transfer yapmak veya akıllı sözleşmede oluşturulan bir veriyi imzalamak demektir. Gas ücreti ödenir, blokzincire kayıt oluşturulur.





Gas Limit: Bir işlemin maksimum harcayabileceği Gas yani hesaplama miktarıdır..

Gas Used: harcanan gerçek gas miktarıdır. Kullanılmayan gas cüzdanına iade edilir. limit yetmezse işlem geri alınır ama harcanan gas yanar.

İşlem Ücreti : İşlemin bloğa dahil edilmesi için ödenen ücret.

Nonce: Bir cüzdan adresinden gönderilen işlemlerin 0 dan başlayarak birer birer artan sıra sayacıdır. İşlemlerin doğru sırada işlenmesini sağlar, imzalanmış bir işlemin ağda tekrar işlenmesini (replay attack) engeller.

Chain ID: İşlemin hangi blokzincir ağı için geçerli olduğunu tanımlayan ağ numarasıdır. Bir test ağında imzalanan işlemin başka bir ağda tekrar işlenmesini önler.  



Txid / Transaction Hash, Sözleşme Adresi ve Block Hash

Transaction Hash: İmzalanmış tek bir işlemin kriptografik özetidir. 

Sözleşme Adresi: Bir akıllı sözleşmenin ağa yayınlandığında aldığı 20 baytlık adresidir.

Block Hash: Bloğun içindeki işlemlerin kriptografik özeti. önceki bloğun bilgisini de içerir.



Pending, receipt ve status nedir? İşlem hash’i neden tek başına başarı kanıtı değildir? 

Pending: İşlemin ağa iletildiğini ancak henüz bir bloğa dahil edilmediğini gösterir.

Receipt: İşlem bir bloğa girip EVM'de yürütüldükten sonra üretilen sonuç raporu. Bloğun numarasını, gas miktarını, log kayıtlarını ve işlem durumunu içerir.

Status: Receipt içinde, işlemin çalışma sonucunu bildiren alan (Success veya fail).



Tx Hash Neden Tek Başına Başarı Kanıtı Değildir?

hash işlem cüzdanda imzalandığı anda üretilir. Pending veya failed olabilir ama hash üretilmiştir. Gerçek başarı yalnızca receipt içindeki Status: Success kontrolüyle kanıtlanır.



\---AKIŞ ŞEMASI---



\[İmzalama]

&#x20;  Kullanıcı hedef adres, veri , gas ve ağ bilgilerini onaylar.

&#x20;  işlem private key ile imzalanır ve Tx Hash üretilir.



|

v      



\[Broadcast]

&#x20;  İmzalı işlem RPC üzerinden Ethereum nodelarına iletilir.

&#x20;  (İP 17 Güncellemesi: benim Tx Hash im: 0x11c7ba343102fc02fae2835827a9952bf0d2d33786da57db82a5f89ad157eda3)



|

v      

&#x20;       

\[Pending]

&#x20;  İşlem validatorlar tarafından seçilmeyi bekler.



|

v      

&#x20;       

\[Execution]

&#x20;  Validator işlemi bir bloğa ekler ve EVM üzerinde çalıştırır.

&#x20;  (İP 17 Güncellemesi: Blok no: 12169777, To: 0x81Dd700C459BF2806A1B5F2a349c89f0106A9036, register("erkankarahan"))

&#x20;       

|

v      

\[Receipt \& State]

&#x20;  Receipt ve state kontrol edilir:

&#x20;  - Status: Success

&#x20;  - Logs: Registered event'i doğrulandı

&#x20;  - Read Contract: kayitliMi -> true



Benim yorumum: “İşlem başarısız” ile “sonucunu öğrenemedim” neden farklıdır?

İşlem başarısız demek, İşlemin bir bloğa dahil edildiği ancak bir kural ihlali veya gas yetersizliği iptal edildiği anlamına gelir. receipt üzerinden görülebilir.

sonucunu öğrenememek ise: İnternet kopması, RPC sağlayıcısının yanıt vermemesi veya başka bir nedenle işlemin son durumunun bilinmemesi. Bu durumda işlem başarıyla onaylanmış ya da pending aşamasında olabilir. 

İki durumu ayırmak önemli. çünkü sonucu henüz doğrulanamamış bir işlemi başarısız oldu sanıp tekrar göndermek, aynı işlemin iki kez çalışmasına veya gereksiz gas harcanmasına yol açar.







## İP 11



Git: Projenin içinde yapılan değişimleri kaydetmek ve takip etmek için kullanılır.

GitHub: insanların Git altyapısını kullanan projelerini yükleyebildiği platform.

README: projenin yapısı/amacı gibi önemli bilgilendirmelerini barındıran dosya.

Commit: Projenin son halini Git sistemine kalıcı kayıt olarak eklemeyi sağlar.

Push: Commit yerelde kayıt oluşturmuştu. bu ise bu kaydı uzak sunucuya kopyalar.

Solidity: Ethereum'un akıllı kontratlarının yazıldığı oop programlama dili.

Remix: Ethereum için akıllı kontratların Solidity kullanılarak yazıldığı uygulama/website.







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



Test USDC Bilgileri ve İşlem Kayıtları

Kullanılan Faucet: Circle Testnet Faucet faucet.circle.com

Sepolia USDC Sözleşme Adresi: 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238

ETH Transferi Hash: 0x65f9af88222863a645d6e4311df6d907768df58ba04dc22d05e5eaaf00942cb1

USDC Transferi Hash: 0x85182d34b6de6a948a14d1bac6f4b35d37f0f94b3f9adf0ccebf9eb67888cec4



İki Transferin Karşılaştırması

**To**: ETH transferinde alıcı doğrudan 2. eğitim hesabımın adresi iken, USDC transferinde To alanı USDC akıllı sözleşmesinin adresi oldu.

**Value**: ETH transferinde gönderilen ETH miktarı yazarken, USDC transferinde 0 ETH yazıyor.

**Input Data**: ETH transferinde veri alanı boş ama USDC transferinde Function: transfer(address,uint256) fonksiyonunu içeren veri var.

**Ücret**: USDC transferi ETH transferinden daha yüksek gas harcadı.

**Token Transferi**: ETH transferinde log oluşmazken, USDC transferinde Logs bölümünde Transfer (index\_topic\_1 address from, index\_topic\_2 address to, uint256 value) var ve Etherscan bunu 'ERC-20 Tokens Transferred' olarak kaydetmiş.



Token'ı Cüzdanda Göstermek ile Zincirde Almak Arasındaki Fark

Bir token'ı zincirde almak, ERC-20 sözleşmesinin state tablosundaki bakiye kaydının güncellenmesi demektir. bu işlem cüzdan uygulamasından bağımsız olarak blokzincirde gerçekleşir.

Tokenı cüzdanda göstermek ise yalnızca MetaMask arayüzüne balanceOf değerini okuyup ekranda göstermektir. Token MetaMask'e eklenmese bile bakiye zincirde kalır ve Etherscan'de görünür.



Benim Yorumum: USDC gönderirken ücretin hangi bakiyeden karşılandığını nasıl gördünüz?

USDC gönderirken gas fee olarak şaşırtıcı şekilde USDC değil SepholiaEth ödedim. etherscan üzerinde işlem ücreti 0.000227668502276685 ETH olarak gözüküyor.







## İP 16



Takım Sözleşmesi ve Kayıt Bilgileri

Ağ: Ethereum Sepolia

Takım Adresi: 0x81Dd700C459BF2806A1B5F2a349c89f0106A9036

Gönderilen İsim Biçimi: erkankarahan

İlk Kayıt Tx Hash: 0x11c7ba343102fc02fae2835827a9952bf0d2d33786da57db82a5f89ad157eda3

İşlem Sonucu: Başarılı

Kontrol Sitesi haloclineblockchain.vercel.app Durumu: sitede gördüm



İkinci Kayıt Denemesi Gözlemi

Aynı eğitim cüzdanıyla `register` fonksiyonu ikinci kez çağırdığımda gas estimation failed diyerek daha derleme sırasında hata verdi. yani ikinci kez gönderemiyoruz..



Benim Yorumum: İsminizin sitede görünmesiyle zincirde kaydedilmiş olması aynı kontrol müdür?

hayır aynı değil. zincirde işlemi "erkankarahan" olarak yaptığımda bu veri zincire kalıcı olarak işlendi. Websitesindeki "Erkan Karahan" ismimin gözükmesi ise zincirden "erkankarahan" isminin alınıp kulüp üyelerinin arasından eşleşeni yazma işlemi. yani websitesinde isim silinse bile zincirde hala veri kalır..





## İP 17



Status: Success yazıyor. işlemim başarılı olmuş yani.

From: 0x952B8633F2c1E66979b08968948c42511fAef3fb (benim adres)

To: 0x81Dd700C459BF2806A1B5F2a349c89f0106A9036 (kulübün sözleşmesinin adresi)

Gas Price: 1.500000014 Gwei (0.000000001500000014 ETH) (işlem için harcanan gas ücreti)

Nonce: 2 (işlemin sırası)

input data: hangi fonksiyonun hangi parametreyle çağrıldığını gösteren veri.

&#x09;0	name	string	erkankarahan



Function: register(string name)



MethodID: 0xf2c298be

\[0]:  0000000000000000000000000000000000000000000000000000000000000020

\[1]:  000000000000000000000000000000000000000000000000000000000000000c

\[2]:  65726b616e6b61726168616e0000000000000000000000000000000000000000





Kanıt Kontrolleri

Decode Input Data: register fonksiyonu ve erkankarahan girdisini doğruladım ve ekran görüntüsü aldım.

Logs (Event): Registered eventinde adresim ve erkankarahan ismini doğruladım ve ekran görüntüsü aldım.

Read Contract (Mevcut State):

&#x20; kayitliMi(0x952B8633F2c1E66979b08968948c42511fAef3fb) sorgusu true döndürdü

&#x20; tumKayitlar çıktısında adresimin karşısında erkankarahan kaydını gördüm.



İP07'ye tekrar dönüp kendi verilerimi yazdım.



İkinci Kayıt Denemesi Değerlendirmesi

Aynı cüzdanla yaptığım ikinci register denemesi işlem ağa gönderilmeden önce Remixin gas tahmini aşamasında reddedildi.



Benim Yorumum: Input Data, event ve mevcut state size hangi farklı soruların cevabını verdi?

Input Data, sözleşmeye ne göndermek istediğimi gösterir

Event: İşlem çalışırken hangi olay gerçekleştiyse onu log olarak yazar.

Mevcut State: Sözleşmenin güncel hafızasında ne kayıtlı ise onu verir. (adresin güncel olarak kayıtlı olup olmadığını ve güncel ismi gösterir).



