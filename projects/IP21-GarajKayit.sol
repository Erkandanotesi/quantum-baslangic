// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract GarajKayitV2 {
    string public etkinlikAdi = "otomobil garaji";
    uint256 public constant KAPASITE = 3;
    uint256 public toplamKayit;

    mapping(address => string) public kayitlar;
    mapping(address => bool) public kayitliMi;

    function kayitOl(string memory _takmaAd) public {
        // Boş takma adı reddet
        require(bytes(_takmaAd).length > 0, "Takma ad bos olamaz");

        // Aynı adresin ikinci kaydını reddet
        require(!kayitliMi[msg.sender], "Bu adres zaten kayitli");

        // Kapasite dolunca yeni kaydı reddet
        require(toplamKayit < KAPASITE, "Etkinlik kapasitesi doldu");

        kayitlar[msg.sender] = _takmaAd;
        kayitliMi[msg.sender] = true;
        toplamKayit += 1;
    }
}