Çalışmanın Amacı ve Hedefler: Blokzincir temellerini öğrenmek, sıfırdan test cüzdanı üretebilmek, Sepolia test ağında akıllı sözleşme yayınlamak/doğrulamak ve bu sözleşmeyle konuşan bir web arayüzü geliştirmek.





website: https://erkandanotesi.github.io/quantum-baslangic/



Kullanılan Araçlar: VS Code, Git, Node.js, npm, MetaMask, Remix IDE

bana yeni olanlar: node.js



Remix de Etherscan de sözleşmenin barındığı yer değildir. ikisi yalnızca tarayıcıda çalışan birer arayüzdür.

İkisi de sözleşmenin adresi ve ABI bilgisini kullanarak, çağrılacak fonksiyonu EVM'in anlayacağı Input Data verisine dönüştürür. Hazırlanan bu işlemi MetaMask'e iletir. MetaMask özel anahtarla imzalayıp bağlı olduğu Sepolia RPC üzerinden Sepolia blokzincirine gönderir. Arayüz değişse de hedef ağ ve kod aynı olduğu için işlem zincirde aynı şekilde çalışır.

