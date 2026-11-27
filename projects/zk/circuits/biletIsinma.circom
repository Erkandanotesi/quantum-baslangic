pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";

// Adım 2A Isınma Devresi:
// Gizli (secret, nullifierSecret) değerlerinden commitment ve nullifierHash üretir.
template BiletIsinma() {
    // Varsayılan olarak tüm signal input'lar GİZLİDİR (private).
    signal input secret;
    signal input nullifierSecret;
    signal input etkinlikId;
    signal input beklenenCommitment;

    // Tüm signal output'lar HERKESE AÇIKTIR (public).
    signal output nullifierHash;

    // 1) 2 girişli Poseidon çipini yerleştirip pinlerini bağlıyoruz
    component commitmentHasher = Poseidon(2);
    commitmentHasher.inputs[0] <== secret;
    commitmentHasher.inputs[1] <== nullifierSecret;

    // Hesaplanan mühür, dışarıdan verilen beklenenCommitment ile eşit olmak zorunda
    beklenenCommitment === commitmentHasher.out;

    // 2) Etkinliğe özgü tek kullanımlık seri numarası (nullifierHash)
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== nullifierSecret;
    nullifierHasher.inputs[1] <== etkinlikId;

    nullifierHash <== nullifierHasher.out;
}

// Sadece etkinlikId ve beklenenCommitment (artı output olan nullifierHash) açık olur.
component main {public [etkinlikId, beklenenCommitment]} = BiletIsinma();
