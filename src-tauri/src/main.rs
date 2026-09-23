// ADB Studio — entry point.
// All logic lives in the library crate (`adb_studio_lib`) so that unit and
// integration tests can use it without launching a window.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    adb_studio_lib::run()
}
