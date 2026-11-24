// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract GarajKayitV3 {
    string public etkinlikAdi = "otomobil garaji";
    uint256 public constant KAPASITE = 3;
    uint256 public toplamKayit;

    address public gorevli;

    mapping(address => string) public kayitlar;
    mapping(address => bool) public kayitliMi;
    mapping(address => bool) public girisYaptiMi;

    event KayitOlundu(address indexed katilimci, string takmaAd);
    event GirisOnaylandi(address indexed katilimci);

    constructor() {
        gorevli = msg.sender;
    }

    modifier sadeceGorevli() {
        require(msg.sender == gorevli, "Sadece gorevli bu islemi yapabilir");
        _;
    }

    function kayitOl(string memory _takmaAd) public {
        require(bytes(_takmaAd).length > 0, "Takma ad bos olamaz");
        require(!kayitliMi[msg.sender], "Bu adres zaten kayitli");
        require(toplamKayit < KAPASITE, "Garaj kapasitesi doldu");

        kayitlar[msg.sender] = _takmaAd;
        kayitliMi[msg.sender] = true;
        toplamKayit += 1;

        emit KayitOlundu(msg.sender, _takmaAd);
    }

    function girisOnayla(address _katilimci) public sadeceGorevli {
        require(kayitliMi[_katilimci], "Bu adres garaja kayitli degil");
        require(!girisYaptiMi[_katilimci], "Bu katilimci zaten giris yapti");

        girisYaptiMi[_katilimci] = true;

        emit GirisOnaylandi(_katilimci);
    }
}