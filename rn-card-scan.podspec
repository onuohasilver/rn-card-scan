Pod::Spec.new do |s|
  s.name         = 'rn-card-scan'
  s.version      = '0.1.0'
  s.summary      = 'React Native card scan SDK'
  s.homepage     = 'https://github.com/onuohasilver/rn-card-scan'
  s.license      = { :type => 'Proprietary' }
  s.author       = { 'onuohasilver' => 'obinna@afriex.co' }
  s.platforms    = { :ios => '15.0' }
  s.source       = { :path => '.' }
  s.source_files = 'ios/**/*.{h,m,mm,swift}'
  s.dependency 'React-Core'
  s.dependency 'GoogleMLKit/TextRecognition'
  s.swift_version = '5.9'
end
