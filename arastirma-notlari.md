## İP 1



Blokzincir: Bloklardan oluşan, her bloğun kendinden önceki blok ile matematiksel olarak bağlı olduğu zincir yapısındaki veri yapısı.

İşlem: Defterdeki en küçük değişime işlem denir.

Blok: belli bir zaman aralığındaki tüm işlemleri, bilgileri içeren pakettir. her blok, bir önceki bloğun hashi ile tekrar hashlenir. böylece zincir oluşur.



işlem -> blok -> blokzincir -> distributed ledger



Merkezi veritabanıyla blokzincir arasındaki fark

Merkezi sistemlerde tam yetkili bir yönetici bulunur. blokzincirde ise append-only yani sadece ekleme işlemi yapılabilir. tek kişi değil konsensüs yönetir.



Geçmiş işlemin kaydı ile sözleşmede tutulan güncel değerin değişmesi ayrımı: geçmiş işlem immutable olmalı. Güncel değer yeni blok ile sonrasına eklenir. eski bloklar değişmez.



Bir etkinlik kayıt sisteminde blokzincir kullanmanın yararı/ek maliyeti

yararı: güvenlik. bilet sahipliği tek bir kişi tarafından değiştirilemez.

ek maliyet: gas fee, uzun onay süresi, hata durumunda geri dönüş olmaması vs. vs.



Normal veritabanı ne zaman tercih edilmeli: taraflar birbirine tamamen güveniyorsa dağıtık deftere gerek kalmaz. o zaman blokzincir yerine geleneksel veritabanı da iş görür.



## İP 2



• Node ve validator nedir? Her node blok üretir mi?

Node: dağıtık defteri depolayan ve doğrulayan her bir parçaya node denir. her biri kendi defterini tutar.

Validator: özellikle PoS'te yeni blok öneren veya önerilmiş blokları doğrulayan node'lara denir. her node validator değildir, mesela PoS'te validator olmak için belli bir miktar stake edilmesi gerekir. yani her node blok üretmez, bloğu validator/madenci üretir.



• Konsensüs neyi sağlar? PoW ve PoS’un temel yaklaşımları nasıl farklılaşır?

Konsensüs: Blokzincirin işlemlerin nasıl doğrulanacağını belirleyen kurallar bütünü. hangi defterin doğru olduğunu belirler, çatallanmayı veya çifte harcamayı engeller. mesela Proof of Stake bir konsensüstür. veya projemizde kullanılan Proof of Authority.

Proof of Stake ve Proof of Work farkı: PoS'te bir blok önerebilmek için belli bir miktar stake etmek gerekir. PoW'te ise iş kanıtı yani işlem gücü gerekir. Proof of stake varlık kanıtı, proof of work ise fiziksel donanım gerektirir. eğer biri PoS'te yanlış bir şey yaparsa stake miktarı yakılarak cezalandırılır, PoW'te ise devasa işlem gücü gereksinimi caydırıcılık olarak kullanılır.



• Public/private ve permissionless/permissioned ağ kavramları hangi özellikleri anlatır? Okuma, işlem gönderme ve doğrulayıcı olma izinlerini ayırın.

Public: Herkese açık ağ demektir. herkes her işlemi okuyabilir.

Private: Özel ağ demek. sadece yetkilendirilmiş kişiler ağı okuyabilir. Proof of Authority kullanan ağlar bunun güzel bir örneğidir.

Permissionless: şartları sağlayan herkes node olup işlem gönderebilir/validator olabilir.

Permissioned: Sadece yetkilendirilmiş kişiler işlem gönderebilir. public ise herkes, private ise yetkililer işlemleri okuyabilir.



• İşlemin bloğa alınması, başarılı çalışması ve kesinleşmesi neden farklıdır?

İşlemin bloğa alınması: İşlemin bellek havuzundan seçilerek bir bloğun içine dahil edilmesidir. işlemin başarılı olduğunu garanti etmez. başarısız olan işlemler de gas harcadıkları için bloğa yazılır.

Başarılı Çalışması: işlemin sanal makinede (mesela EVM) hata vermeden succes durumuna ulaşması.

Kesinleşmesi: İşlemin bloğunun artık geri döndürülemeyecek şekilde sonuçlanmasıdır. PoW'te üzerine yeni bloklar eklendikçe geri dönme ihtimali sıfıra yaklaşır. Ethereum PoS'te ise validator oylamalarıyla birkaç dakika içinde finalize olur.



Benim Yorumum: Ağın konsensüs yapısına bağlıdır. yeterli validator olmazsa sistem kilitlenir. mesela Proof of authority'de 2/3 onay gerekir, bir node kapanınca sistem çoğunluğa ulaşamıyorsa sistem blok onaylayamaz hale gelir.



## İP 3



• Hash, şifreleme ve dijital imza hangi farklı amaçlarla kullanılır?

**Hash:** Tek yönlüdür. İşlemin kriptografik özetini verir. temel amacı veri bütünlüğünü doğrulamaktır.

Şifreleme: çift yönlüdür, veri anahtar ile eski haline getirilebilir.

dijital imza: işlemi yapan kişinin onayladığını kanıtlamak, veri bütünlüğünü doğrulamak için kullanılır.



• Private key, public key, adres, mnemonic ve seed arasındaki ilişki nedir?

Mnemonic: 256 bitlik rastgele verinin, hatasız okuyup yedekleyebilmemiz için 12 kelimeye çevrilmiş halidir.

Seed: Mnemonic kelimelerinin SHA512 gibi fonksiyondan 2048 tur geçirilmesiyle üretilen 512 bitlik ana tohumdur. cüzdandaki tüm hesapların ortak köküdür.

Private Key: Seed'den türetme yolu izlenerek üretilen 128 bitlik anahtardır. Bir hesabın işlemlerini imzalama ve varlıklarını harcama yetkisini verir.

Public Key: Private key ile secp256k1 eliptik curve üzerinde skaler çarpma yapılarak tek yönlü elde edilen açık anahtardır. dijital imzaların doğrulanmasında kullanılır.

Adres: Public key'in Keccak-256 özetinin son 20 baytının alınıp, EIP-55 formatıyla biçimlendirilmesiyle oluşan 0x... kimliğidir.



**Entropi -> Mnemonic -> Seed -> Private key -> public key -> adres**



• Entropi ve checksum ne işe yarar? BIP39, BIP32 ve BIP44 hangi aşamalarla ilgilidir?

Entropi: tahmin edilemez ham rastgelelik kaynağıdır. Anahtarların güvenliğini sağlar.

Checksum: Yazım ve aktarım hatalarını tespit etmek için verinin özetinden türetilen doğrulama bilgisidir. 12 kelimelik mnemonicte entropinin SHA-256 özetinin ilk 4 biti checksum olarak eklenir. Ethereum adreslerinde checksum yanlış karakter yazımını yakalamaya yardımcı olur.



BIP: bitcoin improvement proposal demektir. geliştiriciler toplulupa önerir, onaylanırsa standart haline gelir. EIP ise ethereum için olanı.

BIP39: Hem entropinin checksum eklenerek 12 kelimelik mnemonic dizisine dönüştürülmesini, hemde bu kelimelerden 512 bitlik seed hesaplanmasını sağlar.

BIP32: Tek bir seed üzerinden, Hiyerarşik Deterministik ağaç yapısıyla sınırsız sayıda anahtar çiftinin nasıl türetileceğini belirler.

BIP44: BIP32 ağacı üzerinde çoklu ağ ve çoklu hesap yönetimini standartlaştıran yol şemasını (m/44'/60'/0'/0/0 gibi) tanımlar.



• Cüzdan uygulaması ile hesap aynı şey midir?

Hayır. Hesap ve ona bağlı kayıtlar blokzincirde tutulur. Cüzdan uygulaması ise (ör. MetaMask) parayı saklayan fiziksel cüzdan değildir. blokzincirdeki hesabı görüntülemeyi sağlayan, özel anahtarları yerelde koruyan, işlemleri imzalayan bir arayüzdür. aynı 12 kelime kullanılırsa aynı hesap farklı cüzdan uygulamalarıyla açılabilir.



• Adresi paylaşmakla anahtarı paylaşmak neden farklıdır?

Adresi paylaşmak, banka IBAN'ı vermek gibidir. tek yönlü kriptografik türetme nedeniyle adresten özel anahtar hesaplanamaz, dolayısıyla kimseye harcama yetkisi vermez.

Özel anahtarı paylaşmak ise hesaptaki tüm varlıkları ve yetkilerini kontrol etme hakkını devretmektir.



• Adres Paylaşımının Mahremiyet Etkisi Var mıdır?

Evet. Bir adres gerçek kimlikle eşleştiği anda, herkes o adresin tüm geçmiş gelecek bakiyelerini, transferlerini, bağlantılı adresleri vs. Etherscan den izleyebilir.



Benim yorumum: Cüzdan uygulamasının silinmesi ve kurtarma bilgisinin kaybolması farkı

Cüzdan uygulaması sadece bir arayüz. dolayısıyla uygulamayı silmek hesabı etkilemez. varlıklar uygulamada değil blokzincirde.

kurtarma bilgisini kaybetmek ise hesaba olan erişimi tamamen kaybetmeye yol açar. merkeziyetsiz ağlarda "şifremi unuttum" yok.



Kendime not: entropi 128 bit private key 256 bit.







## İP 4



• Bitcoin ve Ethereum’un temel amaçları ve programlanabilirliği nasıl farklılaşır?

Bitcoin: Temel amacı merkezi bir aracı olmadan çalışan P2P dijital para ve değer saklama aracı olmaktır.

Ethereum: Temel amacı, merkeziyetsiz uygulamaların (dApp) çalıştırılabildiği, programlanabilir bir platform olmaktır. EVM üzerinde akıllı sözleşmeler çalıştırabilir, Bu nedenle sadece para transferi değil, finansal protokoller gibi karmaşık işler doğrudan zincire kodlanabilir.



• Native varlık ve token nedir?

Native Varlık (ETH): blokzincir protokolünün kendi çekirdeğine yerleşik olan ana varlıktır. Ağda gas fee ödemek gibi işlemler için kullanılır. ETH, Ethereum ağının native varlığıdır.

Token (USDC): Kendi blokzinciri olmayan, başka blokzincir üzerindeki bir akıllı sözleşme tarafından üretilen varlıktır. bakiye kayıtları bu sözleşmenin içinde bulunur.

USDC, Ethereum ağı üzerinde bir tokendır. gas ücreti ağın yerel varlığı olan ETH ile ödenir.



• Stablecoin, NFT ve ERC-20 kavramları neyi ifade eder?

ERC-20: Ethereum ağında birbirinin yerine geçebilen (fungible) token'ların uyduğu akıllı sözleşme standardı. tüm uygulamaların farklı tokenlarla tek standart ile konuşmasını sağlar.



Stablecoin (Stabil Varlık): fiyatı başka bir varlığa sabitlenmesi amaçlanan token türüdür.



NFT: Her biri benzersiz kimliğe sahip olan, başka bir şeyle birebir eşdeğer olmayan ve bölünemeyen token türüdür.



• Mainnet ve testnet neden ayrılır? Test ETH ve test USDC gerçek varlıklarla aynı ekonomik değeri taşır mı?

Mainnet: Gerçek işlemlerin yapıldığı ana ağdır. burada yapılan yanlış işlem gerçek maddi kayıp doğurur.

Testnet: akıllı sözleşmelerin gerçek para riske atmadan denenebilmesi için ana ağın teknik işleyişini taklit eden deneme ağıdır (mesela Ethereum Sepolia bir testnettir).

İki ağın ayrılması, canlı ağın gereksiz deneme işlemleriyle dolmasını, test aşamasındaki hataların gerçek fonlara zarar vermesini engeller.

Ekonomik değer: Hayır taşımaz. Test ETH ve USDC sadece test amaçlı olarak ücretsiz edinilen deneme varlıklardır. gerçek ekonomik değer taşımazlar, mainnetteki gerçek ETH/USDC yerine kullanılamazlar.



Benim yorumum: Etkinliğe giriş hakkını temsil etmek için mutlaka token gerekir mi?

hayır. etkinliğe giriş hakkı yapılan satın alma işleminin doğrulanması ile de kanıtlanabilir.

Token kullanmak ancak giriş hakkının başka birine devredilmesi gibi durumlar için gerekebilir.







## İP 5



• Akıllı sözleşme, EVM ve state nedir?

Akıllı Sözleşme: Blokzincirde saklanan, kuralları ve fonksiyonları olan, geçerli bir işlemle çağrıldığında deterministik (her düğümde aynı sonucu verecek) biçimde çalışan kod bütünü.

EVM: Ethereum ağındaki akıllı sözleşmelerin kodlarını donanımdan bağımsız aynı kurallarla çalışmasını sağlayan sanal ortam.

State (Durum): Blokzincirdeki tüm verilerin belirli bir bloktaki güncel durumu.



• Kaynak kod, derleme ve bytecode nasıl ilişkilidir? Deploy ne yapar?

Kaynak Kod: Geliştiricinin yazdığı akıllı sözleşmenin kodudur. genelde yüksek seviye dillerle yazılır, derleme aşamasında düşük seviyeye dönüşür.

Derleme: Derleyicinin kaynak kodu kontrol edip EVM'in çalıştırabileceği bytecodea dönüştürme işlemi.

Bytecode: Derleme sonunda üretilen, EVM tarafından yürütülen hexadecimal makine kodu. Blokzincire yazılan şey Solidity kaynak kodu değil, bu bytecode olur.

Deploy: Derlenmiş bytecode'u alıcı adresi boş bırakılmış özel bir işlemle ağa göndermektir. İşlem onaylandığında ağ bu sözleşmeye benzersiz bir sözleşme adresi atar, bytecode'u o adrese kalıcı olarak yerleştirir ve sözleşmeyi dış çağrılara açar.



• ABI ne işe yarar? Ne zaman elde edilir? Bir sözleşmenin adresi dışında hangi arayüz bilgilerine ihtiyaç duyabilirsiniz?

ABI (Application Binary Interface): Bir web uygulamasının zincirdeki bytecode ile nasıl konuşacağını tanımlayan arayüz sözleşmesi. Hangi fonksiyonların, parametre tiplerinin, dönüş değerlerinin ve event'lerin bulunduğunu bildirir. fonksiyon çağrılarını EVM'in anladığı binary biçimine kodlamak veya dönen veriyi tekrar okunabilir hale çözmek için kullanılır.

Ne Zaman Elde Edilir? compile anında derleyici tarafından üretilir.

Sözleşme Adresi Dışında Gereken Arayüz Bilgileri: sadece adres o adreste hangi fonksiyonların olduğunu söylemez. Sözleşmeyle etkileşime geçmek için adresin yanında ABI, sözleşmenin hangi ağda bulunduğu (ör. Ethereum Sepolia) ve o ağa ulaşmak için bir RPC bağlantısı gerekir.



• Veri okumak ile state değiştiren işlem göndermek nasıl ayrılır?

Veri okuma: Yalnızca mevcut state'i okur, blokzincirde hiçbir değişiklik yapmaz. gas ücreti gerektirmez. yerelde çalışır. anında sonuç döner, onay gerekmez.

State değiştiren işlem: Sözleşmenin kalıcı hafızasını (state) değiştirir veya yeni kayıt üretir. gas ücreti gerektirir. Ağa yayınlanır, validator tarafından bloğa alınır ve tüm nodelar tarafından yürütülür. onay beklemesi gerekir.



• Kaynak kodu verify etmek neyi doğrular? Güvenlik denetimiyle aynı şey midir?

Neyi doğrular: Solidity kaynak kodunun derleyici sürümü, zincirdeki sözleşme adresinde bulunan bytecode ile birebir eşleştiğini doğrular. Böylece ham bytecode yerine gerçek kaynak kodu okunabilir ve explorer üzerinden Read/Write Contract arayüzleri kullanılabilir.

Güvenlik denetimi ile aynı şey mi: Hayır. Verify yalnızca şeffaflık ve kaynak kod-bytecode eşleşmesi sağlar. kodun saldırılara karşı güvenli olduğunu kanıtlamaz. İçinde güvenlik açığı veya backdoor bulunan bir sözleşme de kaynak kodu bytecode ile eşleşiyorsa verify edilebilir.



Benim yorumum: Aynı kod iki farklı adrese yayınlanınca kayıtları neden ayrı olabilir?

bloğa işlenen sözleşmelerin her biri farklı bir state yani depolama alanına sahip olduğu için adres farklıysa zincirdeki kayıtları da farklı olur.







## İP 6



• RPC ve RPC endpoint nedir? Node ve RPC hizmet sağlayıcısı ile ilişkileri nasıldır?

RPC: Başka bir node'da bulunan fonksiyonu çağırarak veri okumak/işlem göndermek için yapılan çağrıya denir.

RPC endpoint: isteğin gönderildiği ağ adresi (https urlsi). mesela: https://sepolia.infura.io/v3/

Node ve RPC hizmet sağlayıcısı ile ilişkisi: blokzincir verisi node'da tutulur ve yüzlerce gb depolama gerektirir. RPC hizmet sağlayıcıları kendi node altyapıları üzerinden hazır RPC endpoint sunarak bu sorunu çözer.



Uygulama -> RPC endpoint -> RPC sağlayıcısı -> blokzincir ağı



• Block explorer nedir? Explorer’ın veya bir RPC adresinin kapanması ağın durduğunu gösterir mi?

Block explorer: blok verilerini kendisi tarayıp kendi sisteminde insanlara sunan siteler. mesela Etherscan.

Kapanması Ağın Durduğunu Gösterir mi: hayır. sadece sitenin sisteminin bloklara erişemediğini gösterir. sorun muhtemelen onların sistemindedir.



• Event/log ile sözleşmenin güncel state’i nasıl ayrılır? Indexer ne işe yarar?

log geçmiş sözleşme işlemlerini tutar. güncel state ise sözleşmenin en son halidir.
indexer ne işe yarar: blok hiyerarşisinini daha düzenli ve taramaya uygun hale getiren araçlardır. hızlı sorgulanabilen bir veritabanında blokları düzenler ve API üzerinden sunar.



Benim yorumum: Explorer olmadan bir kaydı kontrol etmek için hangi yolu araştırırdınız?

RPC endpoint üzerinden sorgu yapmayı araştırdım. Bazı kütüphaneler buldum mesela ethers.js ve web3.py sözleşme adresi üzerinden eth\_call isteğiyle güncel state'i okuyor, eth\_getTransactionReceipt ve eth\_getLogs metotları ise işlemin başarı durumunu ve event kayıtlarını buluyor.







## İP 7



• Cüzdan bağlamak, mesaj imzalamak ve işlem göndermek hangi farklı işlemlerdir?

Cüzdan bağlamak, uygulamaya yalnızca public adresi ve ağ bilgisini okuma izni vermektir. zincirde hiçbir şey yapılmaz.



mesaj imzalamak, offchain bir veriyi kendi private anahtarımızla doğrulamak için yapılır. zincire veri eklenmez.



işlem göndermek, kendi private keyimizle transfer yapmak veya akıllı sözleşmede oluşturulan bir veriyi imzalamak demektir. Gas ücreti ödenir, blokzincire kayıt oluşturulur.



• Gas limit, gas used, işlem ücreti, nonce ve chain ID ne işe yarar?

Gas Limit: Bir işlemin maksimum harcayabileceği Gas yani hesaplama miktarıdır..

Gas Used: harcanan gerçek gas miktarıdır. Kullanılmayan gas cüzdanına iade edilir. limit yetmezse işlem geri alınır ama harcanan gas yanar.

İşlem Ücreti : İşlemin bloğa dahil edilmesi için ödenen ücret.

Nonce: Bir cüzdan adresinden gönderilen işlemlerin 0 dan başlayarak birer birer artan sıra sayacıdır. İşlemlerin doğru sırada işlenmesini sağlar, imzalanmış bir işlemin ağda tekrar işlenmesini (replay attack) engeller.

Chain ID: İşlemin hangi blokzincir ağı için geçerli olduğunu tanımlayan ağ numarasıdır. Bir test ağında imzalanan işlemin başka bir ağda tekrar işlenmesini önler.



• Txid/transaction hash, sözleşme adresi ve block hash neyi tanımlar?

Transaction Hash: İmzalanmış tek bir işlemin kriptografik özetidir.

Sözleşme Adresi: Bir akıllı sözleşmenin ağa yayınlandığında aldığı 20 baytlık adresidir.

Block Hash: Bloğun içindeki işlemlerin kriptografik özeti. önceki bloğun bilgisini de içerir.



• Pending, receipt ve status nedir?

Pending: İşlemin ağa iletildiğini ancak henüz bir bloğa dahil edilmediğini gösterir.

Receipt: İşlem bir bloğa girip EVM'de yürütüldükten sonra üretilen sonuç raporu. Bloğun numarasını, gas miktarını, log kayıtlarını ve işlem durumunu içerir.

Status: Receipt içinde, işlemin çalışma sonucunu bildiren alan (Success veya fail).



İşlem hash’i neden tek başına başarı kanıtı değildir?

hash işlem cüzdanda imzalandığı anda üretilir. Pending veya failed olabilir ama hash üretilmiştir. başarı yalnızca receipt içindeki Status: Success kontrolüyle kanıtlanır.



\---AKIŞ ŞEMASI---



\[İmzalama]

Kullanıcı hedef adres, veri , gas ve ağ bilgilerini onaylar.

işlem private key ile imzalanır ve Tx Hash üretilir.



|

v



\[Broadcast]

İmzalı işlem RPC üzerinden Ethereum nodelarına iletilir.

(İP 17 Güncellemesi: benim Tx Hash im: 0x11c7ba343102fc02fae2835827a9952bf0d2d33786da57db82a5f89ad157eda3)



|

v



\[Pending]

İşlem validatorlar tarafından seçilmeyi bekler.



|

v



\[Execution]

Validator işlemi bir bloğa ekler ve EVM üzerinde çalıştırır.

(İP 17 Güncellemesi: Blok no: 12169777, To: 0x81Dd700C459BF2806A1B5F2a349c89f0106A9036, register("erkankarahan"))



|

v

\[Receipt \& State]

Receipt ve state kontrol edilir:

* Status: Success
* Logs: Registered event'i doğrulandı
* Read Contract: kayitliMi -> true



Benim yorumum: “İşlem başarısız” ile “sonucunu öğrenemedim” neden farklıdır?

İşlem başarısız demek, İşlemin bir bloğa dahil edildiği ancak bir kural ihlali, gas yetersizliğinden iptal edildiği anlamına gelebilir. receipt üzerinden görülebilir.

sonucunu öğrenememek ise: İnternet kopması veya başka bir nedenle işlemin son durumunun bilinmemesi. Bu durumda işlem başarıyla onaylanmış ya da pending aşamasında olabilir.

sonucunu öğrenmediğin bir işlemi başarısız oldu sanıp tekrar göndermek, aynı işlemin iki kez çalışmasına yol açar.







## İP 8



• Web3, L1/L2, DeFi, DAO, oracle, bridge ve zero-knowledge proof (ZK) kavramlarını birkaç cümleyle açıklayın

Web3: Web2.0'ın yerini alacak olan, internetin merkeziyetsiz ve izinsiz erişilebileceği durumunun adı.

L1: Blokzincir ağının kendisi L1 katmanı olur. mesela Bitcoin ve Ethereum L1 projeleridir.

L2: Ana blokzincir ağının yani L1'in üstüne inşa edilen katman. mesela Base Ethereum üzerinde inşa edilmiş bir L2 projesidir.

DeFi: Geleneksel finans sistemi tamamen merkezi kurumlardan oluşur. mesela bankaların verileri merkezlerinde yönetilir. Ancak DeFi'da tek bir merkez yoktur. node'lar birlikte hareket ederek merkeziyetsiz bir finans mekanizması oluşturur. takas, borç veya likidite sağlama gibi finansal işlemler herkese açık, şeffaf akıllı sözleşmelerle sağlanır.

DAO: merkeziyetsiz şekilde yönetilen kurumlar. bu kurumlarda yönetim mekanizması dağıtıktır.

Oracle: zincir dışındaki gerçek dünya verilerini doğrulayıp zincire aktaran köprü. (örn: Chainlink)

Bridge: Farklı ağlar (ör. Ethereum ile Arbitrum) arasındaki iletişimi sağlayan protokollerdir.

Zero-Knowledge Proof: bilginin kendisini vermeden o bilgiye sahip olduğunu veya doğru olduğunu kanıtlama yöntemi.



• Dijital kimlik, gerçek dünya varlıklarının temsili (RWA) ve fiziksel altyapı ağları (DePIN) için birer kullanım örneği bulun



Dijital kimlik örneği: Estonya araştırdığım kadarıyla dijital kimliğe geçen öncü ülkelerden. Kimliğin içinde private key var ve işlemler bu key ile imzalanabiliyor. X-Road adını verdikleri dağıtık bir sistem kullanıyorlar bu sistemde kurumlar sadece kendi verisini tutuyor ve iletişimi bu X-road kanalından yapıyorlar.

KSI blockchain denilen bir sistem de icat etmişler: verilerin bütünlüğünü ile varlık zamanını kriptografik olarak kanıtlayan yüksek ölçekli bir blokzincir teknolojisi.

Ama vatandaşların kişisel verileri zincirde değil. işlemlerin doğrulanması için hash tutan bir dağıtık defter sistemi bu.



RWA örneği: Dünyanın en büyük varlık yönetim şirketi olan BlackRockun projesi. BUIDL adındaki projesiyle kurumsal fonu blokzincire 1 dolara sabitli token olarak taşıyorlar. elde ettikleri parayla ABD hazine bonoları alıyorlar. fonu alanlara da bu tahvil gelirini dağıtıyorlar.



DePin: gerçek dünya altyapılarını topluluk eliyle kuran ve işleten ağ modeli. örneği: Helium ağıyla bölgesel kablosuz/IoT kapsama alanı sağlanıyor.



• ZK ile neyin kanıtlandığını ve hangi bilginin saklanabildiğini basit bir örnekle anlatın.

ZK ile ne kanıtlanıyor: Bilginin doğru olup olmadığı kanıtlanıyor. ancak bunu yaparken bilginin kendisini açığa çıkartmıyor.

hangi bilgi saklanabiliyor: mesela açık arttırmada ürünü almam için yeterli param var mı kontrol etmeleri gerek diyelim. paramın miktarını saklayarak yeterli paramın olduğunu kanıtlayabilirim.



“ZK kullanılıyor” ifadesi bütün işlemlerin gizli olduğu anlamına gelir mi?

zk kullanımı iki farklı şekilde yapılır: ya tam gizlilik için, ya da hız/ucuzluk için gizlilik olmadan işlemi kanıtlamak için kullanılır. eğer ikincisi içinse işlem bilgileri de zincire işlenir, sadece doğrulama maliyetini azaltmak için ZK kullanılır.



Benim yorumum: Hangi alanı daha sonra öğrenmek istersiniz ve neden?

açıkçası hepsi birbirinden ilginç ve güzel. ama en çok ZK teknolojisi ilgimi çekiyor. bir mucize gibi geliyor bana bilgiyi vermeden kanıtlayabilmek.





## İP 9



Seçtiğim Proje: Railgun.



1. dökümantasyonlar

https://railgun.org/

https://docs.railgun.org/wiki

2\.  Hangi problemi, kimler için çözüyor

Ethereum üzerindeki işlemleri ZK teknolojisi ile gizlemeye yarıyor.

Gizlilik isteyen ancak ağın şeffaf yapısından dolayı işlemlerini gizleyemeyen kişiler için EVM uyumlu tüm ağlara uygulanabilen bir çözüm.

RAIL token sadece sisteme yapılacak güncellemeleri onaylamak için işe yarıyor. güvenlik mekanizmasında doğrudan rolü yok.

kullanıcının adresiyle yapılan işlemi, 0zk adresiyle yapıp işlemi gizliyor. bunun yaparken Tornado Cash gibi projelerin aksine mixing yapmıyor.

Yasal sorunlar için mekanizmaları var:

&#x09;Private Proofs of Innocence (PPOI): yüksek riskli fonları tespit edip gizlilik havuzundan 	dışlar.

&#x09;Viewing Keys: gerekirse paylaşılabilen işlem görüntüleme anahtarı.



Gas ücreti Community Broadcaster adı verilen cüzdanlardan ödeniyor ki Etherscan gibi sitelerde kimlik eşleme yapılamasın. işlem zincirde Broadcaster'ın 0x adresinden gelmiş gibi görünür.





3- Zincirde yapılan işlemlerle zincir dışındaki hizmetleri ayırın

Zincirde yapılanlar:

&#x09;Shielding/Unshielding (tokenların private zk cüzdanına girmesi/çıkması)

&#x09;Shielding sonrası DeFi işlemleri

&#x09;Merkle Tree durumunun tutulması (mesela UTXO harcanmamış kalan paranın işlenmesi)

&#x09;zk-SNARK kanıtlarının akıllı sözleşmeler tarafından doğrulanması

off-chain olanlar:

&#x09;zk-SNARK kanıt üretimi

&#x09;Broadcaster iletişimi (Waku P2P ağı ile)

&#x09;

4. Neden blokzincir kullandı ve normal bir veritabanıyla yapılsaydı ne değişirdi

Protokolün amacı işlemlerin gizliliğini sağlamak. geleneksel veritabanı ile yapılan işlemlerin birçok dezavantajı var. doğrulanması sıkıntı, erişimi olan değiştirebilir, veri kolayca yok edilebilir.

Railgun EVM üzerinde akıllı sözleşme olarak çalışıyor. bu sayede emanetçi olmadan (non-custodial) hem gizlilik sunuyor, hem de ayrı bir zincire çıkmadan DeFi likiditesine (takas, borç verme vb.) doğrudan bağlanabiliyor.



5\. Kullanıcı yöneticiye, işletmeciye veya veri sağlayıcısına hangi konularda güvenir?

Resmi cüzdan sağlayıcısı olmadığı için 3. taraf cüzdanlar (railway, faceless vb.) kullanılır. kullanıcı bu 3. taraf cüzdanların private keyi koruduğuna, kötü niyetli olmadığına ve log tutmadığına güvenmeli.

RPC Sağlayıcısı (Veri Sağlayıcısı): kullanıcı kendi düğümünü çalıştırmıyorsa kullandığı RPC servisi IP adresini, ne zaman işlem yaptığını görebilir.

RAIL stake edenler yönetimde kötü niyetli güncelleme yapabilir.

her şey zk teknolojisi sayesinde matematiksel kanıtlarla işlenir. mesela Broadcasterlar kullanıcının varlıklarını tutmaz, işlemin içeriğini göremez, herhangi bir işleme müdahale etmek isteseler zk-SNARK geçersiz olur ve sistem reddeder.





Benim yorumum: Projenin bir güçlü tarafı ve bir sınırlaması

Güçlü tarafı: native olarak zk desteklemeyen zincirlere, çok akıllıca şekilde sistemin kurallarını etkilemeden zk teknolojisini entegre edebilmesi.

Zayıf tarafı: sadece EVM uyumlu sistemlerde çalışır, gas maliyeti yüksektir. ve belki hızı sınırlayabilir?







## İP 10



\-Yarışmanın çözülmesini istediği genel problemler

Ölçeklenebilir DLT altyapıları

Mahremiyet gizlilik odaklı projeler

Dijital cüzdan projeleri

kriptoloji, ZK, homomorfik şifreleme (yine gizlilik odaklı projeler yani)

blokzincir güvenliği

kimlik yönetim sistemleri

DeFi

RWA



\-takımın geçmişte hedeflediği kapsamlar

&#x09;2025 yılında kampüs cüzdanım adlı blokzincir projesini geliştirdiler. bu projede kampüste yemekhane gibi işlemlerin zincir üstüne taşınması hedeflenmişti.

&#x09;2026 yılında takım proje kapsamını büyüterek kurumlar için BFT konsensüsü tabanlı işbirliği çözümü geliştirdi.



Benim yorumum: Bu programda öğrendiğiniz hangi konuların yarışmada daha çok işe yarayacağını düşünüyorsunuz?

mezuniyetten sonra en fazla 3 yıl geçmiş olmalı. 4. sınıf olduğum için önemli.

takım kaptanı, iletişim sorumlusu olmalı.

takım en fazla 5 kişilik olabilir.

projelerin ön raporu martta, sunum raporu haziranda teslim ediliyor. sunumlar ise temmuzun sonunda yapılıyor. yine temmuzun sonunda finalistler açıklanıyor. eylülün sonunda da teknofest oluyor.







## İP 11



* Git: Projenin içinde yapılan değişimleri kaydetmek ve takip etmek için kullanılır.
* GitHub: insanların Git altyapısını kullanan projelerini yükleyebildiği platform.
* README: projenin yapısı/amacı gibi önemli bilgilendirmelerini barındıran dosya.
* Commit: Projenin son halini Git sistemine kalıcı kayıt olarak eklemeyi sağlar.
* Push: Commit yerelde kayıt oluşturmuştu. bu ise bu kaydı uzak sunucuya kopyalar.
* Solidity: Ethereum'un akıllı kontratlarının yazıldığı oop programlama dili.
* Remix: Ethereum için akıllı kontratların Solidity kullanılarak yazıldığı uygulama/website.



Benim yorumum: Hangi araç size yeniydi? Kurulumda nasıl ilerlediniz?

bana yeni olanlar: node.js

nasıl kurdum: https://nodejs.org/en/download sitesinden setup ile.







## İP 12



Entropi Üretimi

math.random() komutu tahmin edilebilir bir pseudorandom üretir. window.crypto.getRandomValues ise OS çekirdeğindeki özel rastgele sayı üreten çip ile üretir. biz ikincisini kullandık.



BIP39 Mnemonic

üretilen entropinin SHA 256 özetinin ilk 4 biti checksum olarak sona eklendi, 11 bitlik 12 parçaya ayrılarak 2048 kelimelik İngilizce BIP39 sözlüğünden 12 kelimeye dönüştürüldü.



BIP39 Seed

12 kelime ve boş passphrase, PBKDF2-HMAC-SHA512 algoritmasından 2048 tur geçirilerek 512 bitlik seed değerine dönüştürüldü



BIP32/BIP44 türetme ve Private Key

512 bitlik seedden "hiyerarşik deterministik" ana düğüm üretildi ve standard ethereum yolu (m/44'/60'/0'/0/0) takip edilerek 256 bitlik private key türetildi.
NOT: hiyerarşik determinizm: hiyerarşik ağaç yapısında organize edilmiş veri demek. deterministik ise aynı seed verildiğinde her zaman aynı private key oluşturulduğu anlamına geliyor.



Not: Eliptik Eğri Çarpması: private key'den public key üretmek için kullanılan tek yönlü matematiksel işlem. çarpma dediğimiz şey, eğri üzerindeki bir başlangıç noktasının kendisiyle defalarca toplanması. (toplama dedimiz de aslında toplama değil, iki noktayı toplamak aslında aralarında düz bir doğru çizip o doğrunun eğriyi kestiği noktanın x eksenine göre simetriği alınıp çıkan sonuçtur..)



Ethereum Adresi

Açık anahtarın Keccak-256 özetinin son 20 byteı alınıp EIP-55 büyük/küçük harf kontrol toplamı (checksum) uygulanarak eth adresi oluşturulur.



BBenim yorumum: Mnemonic ile private key arasındaki farkı kendi uygulamanız üzerinden açıklayın.

Mnemonic tüm bize ait adresleri hiyerarşik deterministik olarak(üstte tanımı var. yani hangi arayzü kullanırsan kullan hep aynı şekilde çalışır) yeniden üretebilen kelimeler.

private key ise tek bir adrese ait işlem imzalama anahtarı.







## İP 13



Adres Eşlemesi

index.html ile oluşturduğum 12-phrase ile metamask'e aktardığım aynı kelimelerin oluşturduğu adreslerin aynı olduğunu ekran resmi alarak doğruladım.



Checksum Gözlemi

12-phrase'den en sondakini rastgele car kelimesiyle değiştirdim ve ip13-checksum.png den de görüleceği üzere geçersiz oldu.

ancak son kelimeyi address kelimesiyle değiştirince doğru olmamasına rağmen 1/16 false-positive hata oranından dolayı kabul edildi.



Benim yorumum: Geçerli mnemonic ile güvenli biçimde üretilmiş mnemonic aynı iddia mıdır?

aynı iddia değildir. bir mnemonic'in geçerli olması kurallara uygun olduğunu gösterir. Güvenli olması ise entropinin üretilme şeklinin ne kadar güvenli olduğuna bağlı.







## İP 14



Kullanılan Fauced: Google Cloud Web3 Faucet

Koşulları: Sadece Google hesabı

Gelen işlem Tx hash: 0x635e45ad49d5523ab02eb737f2ba5764d8ce498505643770bac06b9529e93ec2



PoW faucet kullandıysanız tarayıcıdaki çalışmanın faucet’in dağıtım koşulu olduğunu, Sepolia’da blok üretmekle aynı şey olmadığını araştırın:
PoW faucet kullanmadım faucet.circle.com pow kullanmıyormuş sadece recaptcha ile botları engelliyor.

Sepholia'da blok üretmek testnette gerçekten blok üretir ve validatorler gerçekten üretir. PoW faucette ise hash hesaplaması blok üretimi için değil botları engellemek için. ama benim kullandığım faucet hash hesaplaması yapmıyor.



Benim Yorumum: Harcama yetkisi için Private key gerekli. Adresten veya Public Key'den private key elde etmek neredeyse imkansız. çünkü 256 bitlik private key 2 üzeri 256 ihtimalde bir aynı olabilir, ki bu ihtimali brute force ile hesaplamak neredeyse imkansızdır.







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

Bir tokenı zincirde almak, state tablosundaki bakiye kaydının güncellenmesi demektir. cüzdan uygulamasından bağımsız olarak blokzincirde gerçekleşir.

Tokenı cüzdanda göstermek ise yalnızca balanceOf değerini okuyup ekranda göstermektir. Token MetaMask e eklenmese bile bakiye zincirde kalır ve Etherscande görünür.



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

Aynı eğitim cüzdanıyla register fonksiyonu ikinci kez çağırdığımda gas estimation failed diyerek hata verdi. yani ikinci kez gönderemiyoruz..



Benim Yorumum: İsminizin sitede görünmesiyle zincirde kaydedilmiş olması aynı kontrol müdür?

hayır aynı değil. zincirde işlemi "erkankarahan" olarak yaptığımda bu veri zincire kalıcı olarak işlendi. Websitesindeki "Erkan Karahan" ismimin gözükmesi ise zincirden "erkankarahan" isminin alınıp kulüp üyelerinin arasından eşleşeni yazma işlemi. yani websitesinde isim silinse bile zincirde hala veri kalır..





## İP 17



Status: Success yazıyor. işlemim başarılı olmuş yani.

From: 0x952B8633F2c1E66979b08968948c42511fAef3fb (benim adres)

To: 0x81Dd700C459BF2806A1B5F2a349c89f0106A9036 (kulübün sözleşmesinin adresi)

Gas Price: 1.500000014 Gwei (0.000000001500000014 ETH) (işlem için harcanan gas ücretinin birim fiyatı)

Nonce: 2 (işlemin sırası)

input data: hangi fonksiyonun hangi parametreyle çağrıldığını gösteren veri.

0	name	string	erkankarahan



Function: register(string name)



MethodID: 0xf2c298be





Kanıt Kontrolleri

Decode Input Data: register fonksiyonu ve erkankarahan girdisini doğruladım ve ekran görüntüsü aldım.

Logs (Event): Registered eventinde adresim ve erkankarahan ismini doğruladım ve ekran görüntüsü aldım.

Read Contract (Mevcut State):

kayitliMi(0x952B8633F2c1E66979b08968948c42511fAef3fb) sorgusu true döndürdü

tumKayitlar çıktısında adresimin karşısında erkankarahan kaydını gördüm.



İP07'ye tekrar dönüp kendi verilerimi yazdım.



İkinci Kayıt Denemesi Değerlendirmesi

Aynı cüzdanla yaptığım ikinci register denemesi işlem ağa gönderilmeden önce Remixin gas tahmini aşamasında reddedildi.



Benim Yorumum: Input Data, event ve mevcut state size hangi farklı soruların cevabını verdi?

Input Data, sözleşmeye ne göndermek istediğimi gösterir

Event: İşlem çalışırken hangi olay gerçekleştiyse onu log olarak yazar.

Mevcut State: Sözleşmenin güncel hafızasında ne kayıtlı ise onu verir. (adresin güncel olarak kayıtlı olup olmadığını ve güncel ismi gösterir).







## İP 18



etherscan link: https://sepolia.etherscan.io/address/0x15df0c408dd7617cf0a3140d4f10ba7def5275f3

Sözleşme adresi: 0x15Df0c408DD7617CF0A3140d4F10BA7Def5275f3

deploy tx hash: 0x6bd28355d5799213dc9ebf1865e613f2ab2d8c8ac639172d277bf96aa5a72130

derleyici versiyonu: v0.8.24+commit.e11b9ed9

OPTIMIZATION ENABLED: No

EVM: cancun

LICENSE: none



Deploy ve AtAddress farkı

Deploy: Sözleşmenin bytecode'unu blokzincire sıfırdan yayınlar ve yeni bir sözleşme adresi oluşturur. gas ücreti gerektirir. tamamen boş bir state oluşturur.

At Address: zaten var olan bir sözleşme adresini, Remix'teki derlenmiş ABI ile eşleştirip açar. zincire işlem göndermez, gas ücreti gerektirmez. Mevcut sözleşme adresinin zincirdeki güncel state'ine bağlanır.



verify kanıtlarını görsel olarak ekledim.



Benim yorumum: Her bir sözleşmenin kendi depolaması vardır. kod birebir aynı olsa bile veriler ayrı depolamada tutulur, birbirine karışmaz.







## İP 19



benim sözleşmemdeki TX hash: 0xf37fa54c13a0973e025ce97656c4a2dd170ad53dddfbbd3a977592eb44c4ee95

takımdaki tx hash: 0x11c7ba343102fc02fae2835827a9952bf0d2d33786da57db82a5f89ad157eda3



Benim yorumum: hem takımın kodunda hem de benim kopyaladığım kodda ikinci kez kaydetme engellemesi var. ancak depolamalar yani state'ler farklı olduğu için takımın sözleşmesine 1. kaydı ekledikten sonra kendi sözleşmeme eklediğim kayıt 2. kayıt değil,  yine 1. kayıt olur.







## İP 20



etkinlikAdi ve kayitlar sözleşmenin state'inde tutulur yani kendi özel deplamasında.

\_takmaAd değişkeni ise geçici bellekte tutulur, fonksiyon çağrılınca oluşur ve kayıt yapılırsa kalıcı depolamaya taşınır.



msg.sender görevi: fonksiyonu çağıran yani kayıt yapan kullanıcının adresini verir. kullanıcıdan adres almaktansa bu değişkenden çekerek başkası adına kayıt yapmayı engelleriz.



Benim yorumum: Bu ilk sürüm hangi yanlış kullanımları henüz engellemiyor?

çift kayıt engelleme fonksiyonu yok, çifte kaydı engellemiyor.

takma ad boş olmasını engellemiyor

aynı takma ad birden çok kişi tarafından kullanılabiliyor.







## İP 21



|DENEME|Beklenen sonuç|Alınan Sonuç|
|-|-|-|
|İlk geçerli kayıt|kabul|kabul|
|Aynı hesaptan tekrar kayıt|Ret|ret|
|Yeni hesaptan boş ad|ret|ret|
|İkinci ve üçüncü geçerli kayıt|kabul|kabul|
|Dördüncü farklı hesabın kaydı|ret|ret|





\-Benim yorumum: Adres başına sınırın gerçek kişi sayısını neden garanti etmediğini açıklayın.

Bir kişinin birden çok adresi olabilir. sözleşme farklı kişiyi değil farklı adresi kontrol ediyor.







## İP 22



|DENEME|Beklenen sonuç|Alınan Sonuç|
|-|-|-|
|Görevli kayıtlı kişiye giriş verir|kabul|kabul|
|Görevli olmayan hesap giriş verir|Ret|ret|
|Görevli kayıtsız adrese giriş verir|ret|ret|
|Aynı katılımcıya ikinci giriş|ret|ret|





Benim yorumum: düğmeyi gizlemek sadece remix arayüzünde geçerli olurdu. bu yüzden etherscan arayüzü üzerinden fonksiyon çağırılsaydı engellenemezdi















contract adres: 0xceF9e2B864D08C230B2926F177F7a671379b9935



tx hash: 0xcefcb10af522e33201e041f5fa62155b4379169772c712c4be90ed8af3ee4bdc



derleyici sürümü: 0.8.34+commit.80d5c536



ABI: dosyaya kaydedildi.



2\. hesap kayıt tx hash: 0x29de1a0aa119f9e0d3ef66a385687b981e651ddad46ea5a7db6c76e6ef46ecd2



giriş onay tx hash: 0x51dc28bd26b4d3abf3e6bbfd135e357d15360e19d27ba3181f84d6cb4537f2f4



Benim yorumum: yerel sürümde gorevli olarak remix adreslerini görmem gerekir. Sepolia sürümü ise metamask adresim gorevli olur.

ayrıca etherscan üzerinde chainID de belli eder.























