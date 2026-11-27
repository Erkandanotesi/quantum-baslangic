pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/switcher.circom";

// -----------------------------------------------------------------------------
// Yardımcı Şablon: MerkleAgaciDogrula
// Bir yaprağın (bilet commitment'ı), verilen Poseidon Merkle kökü içinde
// yer aldığını — yaprağın sırasını ve değerini gizleyerek — doğrular.
// -----------------------------------------------------------------------------
template MerkleAgaciDogrula(seviyeSayisi) {
    signal input yaprak;
    signal input kok;
    signal input yolElemanlari[seviyeSayisi]; // Her seviyedeki kardeş düğüm
    signal input yolYonleri[seviyeSayisi];    // 0: mevcut düğüm solda, 1: mevcut düğüm sağda

    component seciciler[seviyeSayisi];
    component hashleyiciler[seviyeSayisi];

    signal dugumler[seviyeSayisi + 1];
    dugumler[0] <== yaprak;

    for (var i = 0; i < seviyeSayisi; i++) {
        // KRİTİK GÜVENLİK KISITI:
        // Switcher, sel sinyalinin yalnızca 0 veya 1 olduğunu varsayar.
        // Bu kısıt yazılmazsa saldırgan 0/1 dışı değerlerle sahte yol üretebilir!
        yolYonleri[i] * (1 - yolYonleri[i]) === 0;

        seciciler[i] = Switcher();
        seciciler[i].sel <== yolYonleri[i];
        seciciler[i].L <== dugumler[i];
        seciciler[i].R <== yolElemanlari[i];

        hashleyiciler[i] = Poseidon(2);
        hashleyiciler[i].inputs[0] <== seciciler[i].outL;
        hashleyiciler[i].inputs[1] <== seciciler[i].outR;

        dugumler[i + 1] <== hashleyiciler[i].out;
    }

    // Hesaplanan en üst düğüm, sözleşmedeki açık kök ile birebir aynı olmalı
    kok === dugumler[seviyeSayisi];
}

// -----------------------------------------------------------------------------
// Ana Şablon: GarajBilet
// Faz 1 — Anonim ZK Garaj Bileti
//
// Kanıtlanan 4 şey:
// 1) commitment = Poseidon(secret, nullifierSecret) bu Merkle kökünde var (hangi bilet olduğu GİZLİ)
// 2) nullifierHash = Poseidon(nullifierSecret, etkinlikId) doğru (çift girişi engeller)
// 3) etkinlikId eşleşiyor (başka sözleşme / ağda tekrar kullanımı engeller)
// 4) baglamHash kriptografik olarak kilitli (mempool'da takmaAd/adres çalınmasını engeller)
// -----------------------------------------------------------------------------
template GarajBilet(seviyeSayisi) {
    // GİZLİ GİRDİLER (Private Witness — tarayıcıdan dışarı çıkmaz)
    signal input secret;
    signal input nullifierSecret;
    signal input yolElemanlari[seviyeSayisi];
    signal input yolYonleri[seviyeSayisi];

    // AÇIK GİRDİLER (Public Signals — sözleşme tarafından doğrulanır)
    signal input kok;
    signal input nullifierHash;
    signal input etkinlikId;
    signal input baglamHash;

    // 1. Bilet mührünü (commitment) hesapla
    component commitmentHasher = Poseidon(2);
    commitmentHasher.inputs[0] <== secret;
    commitmentHasher.inputs[1] <== nullifierSecret;

    // 2. Etkinliğe özel tek kullanımlık seri özetini (nullifierHash) doğrula
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== nullifierSecret;
    nullifierHasher.inputs[1] <== etkinlikId;
    nullifierHash === nullifierHasher.out;

    // 3. Biletin geçerli Merkle ağacında bulunduğunu doğrula
    component merkle = MerkleAgaciDogrula(seviyeSayisi);
    merkle.yaprak <== commitmentHasher.out;
    merkle.kok <== kok;
    for (var i = 0; i < seviyeSayisi; i++) {
        merkle.yolElemanlari[i] <== yolElemanlari[i];
        merkle.yolYonleri[i] <== yolYonleri[i];
    }

    // 4. Front-running (kanıt çalınması) koruması:
    // baglamHash = keccak256(takmaAd, girisAdresi) % SNARK_SCALAR_FIELD
    // Karesel kısıt ekleyerek derleyicinin bu açık girdiyi optimize edip atmasını engelliyoruz.
    signal baglamKare;
    baglamKare <== baglamHash * baglamHash;
}

// 10 seviye => 2^10 = 1024 anonim bilet kapasitesi
// publicSignals sırası: [0]=kok, [1]=nullifierHash, [2]=etkinlikId, [3]=baglamHash
component main {public [kok, nullifierHash, etkinlikId, baglamHash]} = GarajBilet(10);
