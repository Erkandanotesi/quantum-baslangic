// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract GarajKayitV1 {
    string public etkinlikAdi = "otomobil garaji";

    mapping(address => string) public kayitlar;

    function kayitOl(string memory _takmaAd) public {
        kayitlar[msg.sender] = _takmaAd;
    }
}