/// Project-wide defaults other developers can change in one place.
///
/// [kDefaultLanHost] is this PC's mDNS name (`ComputerName.local`).
/// Phones, passkeys, and Google sign-in use [kDefaultLanUrl] first, then
/// fall back to a scanned LAN IP if the hostname does not resolve.
const String kDefaultLanHost = 'zoro.local';
const int kDefaultLanPort = 38480;
const String kDefaultLanUrl = 'http://$kDefaultLanHost:$kDefaultLanPort';
