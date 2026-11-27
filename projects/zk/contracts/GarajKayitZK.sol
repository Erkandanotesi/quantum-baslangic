// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPoseidonT3 {
    function hash(uint256[2] memory input) external pure returns (uint256);
}

interface IGroth16Verifier {
    function verifyProof(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[4] calldata _pubSignals
    ) external view returns (bool);
}

/**
 * @title GarajKayitZK
 * @notice Faz 1 — Anonim ZK Garaj Bileti Protokolü
 *
 * Akış:
 * 1) Katılımcı 1. cüzdanıyla `biletAl(commitment)` çağırır ve bilet ücretini öder.
 *    Zincire yalnızca Poseidon(secret, nullifierSecret) mührü (commitment) yazılır.
 *    Sözleşme bu mührü 10 seviyeli zincir üstü Poseidon Merkle Ağacına ekler.
 * 2) Katılımcı tarayıcısında Groth16 ZK kanıtı üretir ve 2. (temiz) cüzdanıyla
 *    veya Görevli (Relayer) üzerinden `zkGirisYap(...)` çağırır.
 *    Sözleşme kanıtı doğrular, nullifier'ı yakar ve anonim girişi kaydeder.
 *    1. cüzdan (ödeme) ile 2. cüzdan (giriş) arasında zincirde bağ oluşmaz.
 */
contract GarajKayitZK {
    // BN254 (alt_bn128) skaler cisim asal sayısı (Circom / snarkjs ile birebir aynı)
    uint256 public constant SNARK_SCALAR_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    // 10 seviye => en fazla 2^10 = 1024 anonim bilet
    uint32 public constant AGAC_DERINLIGI = 10;

    // Son 30 Merkle kökü saklanır: kanıt üretilirken yeni bilet kesilse bile kanıt geçerli kalır
    uint32 public constant KOK_GECMISI_BOYUTU = 30;

    string public etkinlikAdi;
    uint256 public immutable KAPASITE;
    uint256 public immutable BILET_UCRETI;
    uint256 public immutable ETKINLIK_ID;

    IPoseidonT3 public immutable poseidon;
    IGroth16Verifier public immutable verifier;
    address public gorevli;

    // Zincir üstü Incremental Poseidon Merkle Ağacı durumu
    uint256[AGAC_DERINLIGI] public sifirlar;
    uint256[AGAC_DERINLIGI] public doluAltAgaclar;
    uint256[KOK_GECMISI_BOYUTU] public kokler;
    uint32 public guncelKokIndeksi;
    uint32 public sonrakiYaprakIndeksi;

    // Aynı bilet mührünün iki kez eklenmesini önler
    mapping(uint256 => bool) public taahhutKayitliMi;

    // Aynı gizli biletin iki kez kullanılmasını (çift giriş / Sybil) önler
    mapping(uint256 => bool) public kullanilanNullifier;

    struct ZkGirisKaydi {
        uint256 nullifierHash;
        string takmaAd;
        address girisAdresi;
        address gonderen;
        uint256 zaman;
    }

    ZkGirisKaydi[] private _girisler;
    uint256 public toplamGiris;

    event BiletAlindi(
        uint256 indexed commitment,
        uint32 indexed yaprakIndeksi,
        uint256 yeniKok,
        uint256 zaman
    );

    event ZkGirisYapildi(
        uint256 indexed nullifierHash,
        string takmaAd,
        address indexed girisAdresi,
        address indexed gonderen,
        uint256 zaman
    );

    event UcretlerCekildi(address indexed gorevli, uint256 miktar);

    modifier sadeceGorevli() {
        require(msg.sender == gorevli, "Sadece gorevli bu islemi yapabilir");
        _;
    }

    constructor(
        address _poseidon,
        address _verifier,
        string memory _etkinlikAdi,
        uint256 _kapasite,
        uint256 _biletUcreti
    ) {
        require(_poseidon != address(0), "Poseidon adresi bos olamaz");
        require(_verifier != address(0), "Verifier adresi bos olamaz");
        require(bytes(_etkinlikAdi).length > 0, "Etkinlik adi bos olamaz");
        require(
            _kapasite > 0 && _kapasite <= (uint256(1) << AGAC_DERINLIGI),
            "Kapasite 1 ile 1024 arasinda olmali"
        );

        poseidon = IPoseidonT3(_poseidon);
        verifier = IGroth16Verifier(_verifier);
        gorevli = msg.sender;
        etkinlikAdi = _etkinlikAdi;
        KAPASITE = _kapasite;
        BILET_UCRETI = _biletUcreti;

        // Bu ağ + bu sözleşme adresine özel benzersiz etkinlik kimliği (cross-contract replay koruması)
        ETKINLIK_ID =
            uint256(keccak256(abi.encodePacked(block.chainid, address(this)))) %
            SNARK_SCALAR_FIELD;

        // Boş Merkle alt ağaçlarının başlangıç hash'lerini (0'dan yukarı) hazırla
        uint256 mevcutSifir = 0;
        sifirlar[0] = mevcutSifir;
        doluAltAgaclar[0] = mevcutSifir;

        for (uint32 i = 1; i < AGAC_DERINLIGI; i++) {
            mevcutSifir = poseidon.hash([mevcutSifir, mevcutSifir]);
            sifirlar[i] = mevcutSifir;
            doluAltAgaclar[i] = mevcutSifir;
        }

        kokler[0] = poseidon.hash([mevcutSifir, mevcutSifir]);
    }

    /**
     * @notice Aşama 1: Gizli biletin Poseidon mührünü (commitment) ödeyerek zincire kaydeder.
     * @param _commitment Poseidon(secret, nullifierSecret) değeri
     */
    function biletAl(uint256 _commitment) external payable {
        require(msg.value == BILET_UCRETI, "Bilet ucreti tam odenmeli");
        require(sonrakiYaprakIndeksi < KAPASITE, "Garaj bilet kontenjani doldu");
        require(
            _commitment > 0 && _commitment < SNARK_SCALAR_FIELD,
            "Gecersiz commitment"
        );
        require(!taahhutKayitliMi[_commitment], "Bu bilet muhru zaten kayitli");

        taahhutKayitliMi[_commitment] = true;

        uint32 yaprakIndeksi = sonrakiYaprakIndeksi;
        uint32 mevcutIndeks = yaprakIndeksi;
        uint256 mevcutHash = _commitment;
        uint256 sol;
        uint256 sag;

        for (uint32 i = 0; i < AGAC_DERINLIGI; i++) {
            if (mevcutIndeks % 2 == 0) {
                sol = mevcutHash;
                sag = sifirlar[i];
                doluAltAgaclar[i] = mevcutHash;
            } else {
                sol = doluAltAgaclar[i];
                sag = mevcutHash;
            }
            mevcutHash = poseidon.hash([sol, sag]);
            mevcutIndeks /= 2;
        }

        uint32 yeniKokIndeksi = (guncelKokIndeksi + 1) % KOK_GECMISI_BOYUTU;
        guncelKokIndeksi = yeniKokIndeksi;
        kokler[yeniKokIndeksi] = mevcutHash;
        sonrakiYaprakIndeksi = yaprakIndeksi + 1;

        emit BiletAlindi(_commitment, yaprakIndeksi, mevcutHash, block.timestamp);
    }

    /**
     * @notice Aşama 2: Groth16 ZK kanıtını doğrulayarak garaja anonim giriş yapar.
     *         Hem katılımcının temiz 2. cüzdanı hem de Görevli (Relayer) tarafından çağrılabilir.
     */
    function zkGirisYap(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256 _kok,
        uint256 _nullifierHash,
        string calldata _takmaAd,
        address _girisAdresi
    ) external {
        require(
            bytes(_takmaAd).length > 0 && bytes(_takmaAd).length <= 48,
            "Takma ad 1-48 bayt arasinda olmali"
        );
        require(toplamGiris < KAPASITE, "Garaj giris kapasitesi doldu");
        require(bilinenKokMu(_kok), "Gecersiz veya cok eski Merkle koku");
        require(
            _nullifierHash > 0 && _nullifierHash < SNARK_SCALAR_FIELD,
            "Gecersiz nullifier"
        );
        require(
            !kullanilanNullifier[_nullifierHash],
            "Bu bilet daha once kullanildi"
        );

        // Front-running koruması: kanıt, bu takma ad ve giriş adresine kilitlidir
        uint256 baglamHash = baglamHashHesapla(_takmaAd, _girisAdresi);

        // Circom publicSignals sırası: [0]=kok, [1]=nullifierHash, [2]=etkinlikId, [3]=baglamHash
        uint256[4] memory pubSignals = [
            _kok,
            _nullifierHash,
            ETKINLIK_ID,
            baglamHash
        ];

        require(
            verifier.verifyProof(_pA, _pB, _pC, pubSignals),
            "Gecersiz ZK kaniti"
        );

        kullanilanNullifier[_nullifierHash] = true;
        toplamGiris += 1;

        _girisler.push(
            ZkGirisKaydi({
                nullifierHash: _nullifierHash,
                takmaAd: _takmaAd,
                girisAdresi: _girisAdresi,
                gonderen: msg.sender,
                zaman: block.timestamp
            })
        );

        emit ZkGirisYapildi(
            _nullifierHash,
            _takmaAd,
            _girisAdresi,
            msg.sender,
            block.timestamp
        );
    }

    /**
     * @notice Biriken bilet ücretlerini yalnızca görevli çekebilir.
     */
    function ucretleriCek() external sadeceGorevli {
        uint256 bakiye = address(this).balance;
        require(bakiye > 0, "Cekilecek bakiye yok");

        (bool ok, ) = payable(gorevli).call{value: bakiye}("");
        require(ok, "ETH transferi basarisiz");

        emit UcretlerCekildi(gorevli, bakiye);
    }

    function guncelKok() external view returns (uint256) {
        return kokler[guncelKokIndeksi];
    }

    function toplamBilet() external view returns (uint256) {
        return sonrakiYaprakIndeksi;
    }

    function bilinenKokMu(uint256 _kok) public view returns (bool) {
        if (_kok == 0) return false;
        uint32 i = guncelKokIndeksi;
        do {
            if (_kok == kokler[i]) return true;
            if (i == 0) {
                i = KOK_GECMISI_BOYUTU - 1;
            } else {
                i--;
            }
        } while (i != guncelKokIndeksi);
        return false;
    }

    function baglamHashHesapla(
        string calldata _takmaAd,
        address _girisAdresi
    ) public pure returns (uint256) {
        return
            uint256(keccak256(abi.encodePacked(_takmaAd, _girisAdresi))) %
            SNARK_SCALAR_FIELD;
    }

    function tumGirisler() external view returns (ZkGirisKaydi[] memory) {
        return _girisler;
    }
}
